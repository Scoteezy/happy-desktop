/**
 * The session gym's leak mode (`PERF_MODE=leak`): a long, seeded, randomized mix of everything the
 * gym already does, weighted like a person working in one main chat, while the renderer, the perf
 * daemon and the perf web host are sampled after garbage collection at a fixed cadence. It ends
 * with one verdict line per component, the persistence audit, and, for any process that grew, a
 * cause summary from two heap snapshots.
 *
 * Growth is judged only once every bounded store is full, so a cache filling to its bound is not
 * mistaken for a leak. The warm-up fills each of them with the same kind of content the measured
 * mix produces:
 *
 * - every stream target is pushed past the 100 runs a session nobody reads keeps;
 * - the home chat's prepared-text cache is saturated, and its window of runs filled;
 * - the daemon's event buffer and journal turn over many times;
 * - the page reload, the daemon restart and a tour of every heavy session happen here.
 *
 * During the measured phase every action ends in the home chat, so the per-conversation layout
 * cache of the chat a reader keeps open is never evicted: what it keeps is what a reader leaves
 * open all day. Afterwards the daemon restarts once more, and the audit reads what it restored.
 *
 * The seed fixes the action sequence; it is logged first, so `PERF_SEED=<seed>` replays a run.
 */
import { spawn } from "node:child_process";
import { createWriteStream, openSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { join } from "node:path";
import type { CDPSession, Locator, Page } from "playwright";

import { heapGrowth, heapGrowthLines, heapSnapshotRead, samplingSites } from "./heapDiff.ts";
import { leakVerdict, leakVerdictLine, type LeakSample, type LeakVerdict } from "./leakVerdict.ts";

interface Agent {
    readonly id: string;
    readonly title: string;
    readonly workspaceId: string;
}

interface Run {
    readonly id: string;
    readonly messages: readonly {
        readonly id?: string;
        readonly role: string;
        readonly content: readonly { type: string; text?: string }[];
    }[];
}

/** What the leak mode borrows from the session gym. */
export interface LeakGym {
    readonly page: Page;
    readonly cdp: CDPSession;
    readonly url: string;
    readonly scratch: string;
    readonly out: string;
    readonly label: string;
    readonly daemon: <T>(method: string, path: string, body?: unknown) => Promise<T>;
    readonly sessionRows: (page: Page, title: string, agentId?: string) => Locator;
    readonly switchTo: (
        page: Page,
        title: string,
        fresh?: string,
        hoverMs?: number,
        agentId?: string,
    ) => Promise<Record<string, unknown>>;
    readonly writeReplay: (
        agentId: string,
        sourceAgentId: string,
        pace?: { chunk?: number; delayMs?: number },
        finalText?: string,
    ) => Promise<number>;
    readonly busiestRun: (sourceAgentId: string) => Promise<Run>;
    readonly visibleConversationText: (page: Page) => Promise<string>;
    readonly daemonPidSet: (pid: string) => void;
    readonly hoverMs: number;
    readonly paletteTypeDelayMs: number;
    readonly paletteDwellMs: number;
    /** Sessions the command palette finds by title. */
    readonly paletteSessions: readonly string[];
    /** Heavy real sessions a reader glances at, and the ones replayed runs stream into. */
    readonly sessions: readonly string[];
    readonly streams: readonly { agentId: string; title: string }[];
    readonly streamSource: string;
}

const env = (name: string, fallback: string) => Number(process.env[name] ?? fallback);
const MINUTES = env("PERF_LEAK_MINUTES", "20");
/** Minutes of the mix after the warm-up has filled every bounded store, before measuring. */
const WARMUP_MINUTES = env("PERF_LEAK_WARMUP_MINUTES", "3");
/** Runs each stream target gets in warm-up: past the 100 a session nobody reads keeps. */
const PREFILL_STREAM_RUNS = env("PERF_LEAK_PREFILL_STREAM_RUNS", "105");
/** Runs into the home chat in warm-up: past the 200 at which a followed chat sheds its oldest. */
const PREFILL_HOME_RUNS = env("PERF_LEAK_PREFILL_HOME_RUNS", "230");
/** Replies of unique paragraphs that fill the home chat's prepared-text cache to its budget. */
const SATURATE_RUNS = env("PERF_LEAK_SATURATE_RUNS", "80");
const SAMPLE_MS = env("PERF_LEAK_SAMPLE_S", "30") * 1000;
const MODE = {
    effort: "medium",
    modelId: "anthropic/opus-5-5",
    permissionMode: "full_access",
    providerId: "claude",
    serviceTier: null,
};
const REPLAY_PACE = { chunk: 24, delayMs: 6 };
const SHORT_PACE = { chunk: 32, delayMs: 4 };
const FAST_PACE = { chunk: 400, delayMs: 0 };
/** One composer or rapid send into the home chat for about this many follow runs: the share the mix has. */
const RECORDED_EVERY = 22;
const MB = 1e6;

/**
 * Growth per hour each component may show once its bounded stores are full. These sit well
 * above what a clean run shows and well below a leak a reader would notice in a working day.
 */
const LIMITS: Record<string, number> = {
    "daemon handles": env("PERF_LEAK_LIMIT_DAEMON_HANDLES", "60"),
    "daemon heap": env("PERF_LEAK_LIMIT_DAEMON_HEAP", "25"),
    "daemon rss": env("PERF_LEAK_LIMIT_DAEMON_RSS", "80"),
    "renderer dom nodes": env("PERF_LEAK_LIMIT_DOM", "3000"),
    "renderer fibers": env("PERF_LEAK_LIMIT_FIBERS", "3000"),
    "renderer heap": env("PERF_LEAK_LIMIT_RENDERER_HEAP", "8"),
    "renderer listeners": env("PERF_LEAK_LIMIT_LISTENERS", "600"),
    "renderer text trees": env("PERF_LEAK_LIMIT_TEXT_TREES", "400"),
    "web heap": env("PERF_LEAK_LIMIT_WEB_HEAP", "8"),
    "web rss": env("PERF_LEAK_LIMIT_WEB_RSS", "40"),
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A request to a process probe (`perf/leakProbe.ts`) over its Unix socket. */
function probe<T>(role: string, path: string, method = "GET"): Promise<T | undefined> {
    const directory = process.env.PERF_PROBE_DIR;
    if (directory === undefined) return Promise.resolve(undefined);
    return new Promise((resolve) => {
        const req = request(
            { method, path, socketPath: join(directory, `${role}.sock`), timeout: 300_000 },
            (res) => {
                let data = "";
                res.setEncoding("utf8");
                res.on("data", (chunk: string) => (data += chunk));
                res.on("end", () =>
                    resolve(res.statusCode === 200 ? (JSON.parse(data) as T) : undefined),
                );
            },
        );
        req.on("error", () => resolve(undefined));
        req.end();
    });
}

interface ProcessMemory {
    readonly pid: number;
    readonly rss: number;
    readonly heapUsed: number;
    readonly handles: number;
    readonly requestLogCapped: boolean;
}

interface Sample {
    readonly phase: "warmup" | "measure";
    readonly minute: number;
    readonly actions: number;
    readonly renderer: Record<string, number>;
    readonly daemon?: ProcessMemory;
    readonly web?: ProcessMemory;
}

/** Read-only sizes of the renderer's parts, from the DOM and React's own fiber tree. */
function componentSizes(): Record<string, number> {
    const visible = (selector: string) =>
        [...document.querySelectorAll(selector)].find((element) => element.checkVisibility());
    type Fiber = {
        child: Fiber | null;
        sibling: Fiber | null;
        return: Fiber | null;
        memoizedProps?: { value?: Record<string, unknown> };
    };
    const fiberOf = (element: Element | undefined): Fiber | undefined => {
        if (element === undefined) return undefined;
        const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"));
        return key === undefined ? undefined : (element as unknown as Record<string, Fiber>)[key];
    };
    // The text-layout cache the conversation on screen measures in: the nearest context value shaped like one.
    let text: Record<string, unknown> | undefined;
    for (
        let fiber: Fiber | null | undefined = fiberOf(
            visible('[data-happy-desktop-ui="message-list"]'),
        );
        fiber !== undefined && fiber !== null;
        fiber = fiber.return
    ) {
        const value = fiber.memoizedProps?.value;
        if (value !== undefined && value !== null && value.preparedOrder instanceof Map) {
            text = value;
            break;
        }
    }
    const keys = (value: unknown) =>
        value !== null && typeof value === "object" ? Object.keys(value).length : 0;
    let fibers = 0;
    const container = document.getElementById("root") ?? document.body;
    const rootKey = Object.keys(container).find((name) => name.startsWith("__reactContainer$"));
    const stack: Fiber[] =
        rootKey === undefined ? [] : [(container as unknown as Record<string, Fiber>)[rootKey]!];
    while (stack.length > 0) {
        const fiber = stack.pop()!;
        fibers += 1;
        if (fiber.sibling !== null) stack.push(fiber.sibling);
        if (fiber.child !== null) stack.push(fiber.child);
    }
    const streaming = text?.streaming as Record<string, unknown> | undefined;
    return {
        fibers,
        liveElements: document.getElementsByTagName("*").length,
        preparedKB: Math.round(Number(text?.preparedBytes ?? 0) / 1024),
        retainedViews: document.querySelectorAll('[data-happy-desktop-ui="retained-view"]').length,
        sidebarRows: document.querySelectorAll('[data-happy-desktop-ui="sidebar-item"]').length,
        streamingPreparedKB: Math.round(Number(streaming?.preparedBytes ?? 0) / 1024),
        textHeights: keys(text?.markdownHeights),
        textTrees: keys(text?.markdownTrees),
    };
}

export async function leakRun(gym: LeakGym): Promise<number> {
    const { page, cdp, daemon } = gym;
    const seed = Number(process.env.PERF_SEED ?? String(Math.floor(Math.random() * 1e9)));
    console.log(
        `leak: seed ${String(seed)} (replay with PERF_SEED=${String(seed)}), ${String(MINUTES)} min measured after the warm-up`,
    );
    let rngState = seed >>> 0;
    // mulberry32
    const random = (): number => {
        rngState = (rngState + 0x6d2b79f5) >>> 0;
        let t = rngState;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
    const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));

    const pageErrors: string[] = [];
    const serverErrors: string[] = [];
    const harnessErrors: string[] = [];
    const draftsLost: string[] = [];
    let echoesMissing = 0;
    page.on("pageerror", (error) => pageErrors.push(error.message.slice(0, 200)));
    // While the daemon restarts, the web host answers 503 for it; that is the restart, not an error.
    let restartingUntil = 0;
    page.on("response", (response) => {
        if (Date.now() < restartingUntil) return;
        if (response.status() >= 500 && response.url().includes("/__happy_local_happy_agent"))
            serverErrors.push(`${String(response.status())} ${new URL(response.url()).pathname}`);
    });

    // ------------------------------------------------------------ sessions

    const known = new Map<string, Agent>();
    const collect = (value: unknown): void => {
        if (value === null || typeof value !== "object") return;
        const record = value as Record<string, unknown>;
        if (
            typeof record.id === "string" &&
            typeof record.workspaceId === "string" &&
            typeof record.title === "string"
        ) {
            known.set(record.id, {
                id: record.id,
                title: record.title,
                workspaceId: record.workspaceId,
            });
        }
        for (const child of Object.values(record)) collect(child);
    };
    collect(await daemon("GET", "/v0/bootstrap/desktop"));
    const titled = (title: string) => [...known.values()].find((agent) => agent.title === title);
    const heavy = gym.sessions.map(titled).filter((agent): agent is Agent => agent !== undefined);
    const streams: Agent[] = gym.streams.map(
        (stream) =>
            known.get(stream.agentId) ?? {
                id: stream.agentId,
                title: stream.title,
                workspaceId: "",
            },
    );
    const anchor = heavy[0]!;
    const create = async (title: string) =>
        (
            await daemon<{ agent: Agent }>("POST", "/v0/agents", {
                title,
                workspaceId: anchor.workspaceId,
            })
        ).agent;
    // The reader's main chat, and empty peers in its workspace that every sample opens in a fixed
    // order, so the views a workspace keeps and the layout caches are the same at every sample.
    const home = await create(`Leak home ${String(seed)}`);
    const peers: Agent[] = [];
    for (let index = 1; index <= 7; index += 1)
        peers.push(await create(`Leak peer ${String(index)} ${String(seed)}`));
    console.log(
        `leak: home ${home.id}, ${String(heavy.length)} heavy sessions, ${String(streams.length)} stream targets`,
    );

    // Real recorded text for replies, and recorded runs to replay.
    await mkdir(join(gym.scratch, "replay"), { recursive: true });
    const sources = [gym.streamSource, ...heavy.slice(0, 3).map((agent) => agent.id)];
    const texts: string[] = [];
    for (const source of sources) {
        const run = await gym.busiestRun(source).catch(() => undefined);
        for (const message of run?.messages ?? []) {
            if (message.role === "user") continue;
            for (const block of message.content)
                if (block.type === "text" && (block.text?.length ?? 0) > 120)
                    texts.push(block.text!.slice(0, 4000));
        }
    }
    if (texts.length === 0) throw new Error("No recorded text to reply with.");

    // ------------------------------------------------------------ sends and the audit trail

    let marker = 0;
    /** Every audited send: its prompt and its reply carry `LEAK_P_<seed>_<n>` and `LEAK_R_<seed>_<n>`. */
    const sends: { agentId: string; n: number; via: string; aborted?: boolean }[] = [];
    const outstanding = new Map<string, number>();
    const tag = (kind: "P" | "R" | "W", n: number) => `LEAK_${kind}_${String(seed)}_${String(n)}`;
    const replyStored = async (agentId: string, n: number, kind: "R" | "W" = "R") => {
        const latest = await daemon<{ runs: Run[] }>(
            "GET",
            `/v0/agents/${agentId}/messages?limit=2&omitToolData=true`,
        );
        if (!JSON.stringify(latest.runs).includes(tag(kind, n) + " ")) return false;
        return (
            (await daemon<{ agent: { status: string } }>("GET", `/v0/agents/${agentId}`)).agent
                .status === "idle"
        );
    };
    /** Waits for a send's run to finish, or aborts it, so the next one never races its plan file. */
    const finish = async (agentId: string, timeoutMs = 120_000) => {
        const n = outstanding.get(agentId);
        if (n === undefined) return;
        const until = Date.now() + timeoutMs;
        while (Date.now() < until) {
            if (await replyStored(agentId, n)) {
                outstanding.delete(agentId);
                return;
            }
            await sleep(250);
        }
        await daemon("POST", `/v0/agents/${agentId}/abort`, {}).catch(() => undefined);
        const send = sends.find((s) => s.agentId === agentId && s.n === n);
        if (send !== undefined) send.aborted = true;
        outstanding.delete(agentId);
        harnessErrors.push(
            `run ${tag("P", n)} in ${agentId} did not finish in ${String(timeoutMs / 1000)} s; aborted`,
        );
        console.log(`leak: ${harnessErrors.at(-1)!}`);
    };
    const quiesce = async () => {
        for (const agentId of [...outstanding.keys()]) await finish(agentId);
    };
    const planWrite = async (
        agentId: string,
        text: string,
        pace: { chunk: number; delayMs: number },
    ) => {
        await writeFile(
            join(gym.scratch, "replay", `${agentId}.json`),
            JSON.stringify({ ...pace, inferences: [{ blocks: [{ text, type: "text" }] }] }),
        );
    };
    /**
     * Starts a run by API, as an agent working on its own does: one answer of `text`, or a
     * recorded run replayed that ends with it.
     */
    const apiSend = async (
        agentId: string,
        text: string,
        recorded: boolean,
        pace = recorded ? REPLAY_PACE : SHORT_PACE,
    ) => {
        await finish(agentId);
        const n = (marker += 1);
        const answer = `${tag("R", n)} \n\n${text}`;
        if (recorded) await gym.writeReplay(agentId, gym.streamSource, pace, answer);
        else await planWrite(agentId, answer, pace);
        await daemon("POST", `/v0/agents/${agentId}/send`, {
            mode: MODE,
            text: `${tag("P", n)} Keep going with the next step.`,
        });
        sends.push({ agentId, n, via: recorded ? "api-replay" : "api" });
        outstanding.set(agentId, n);
        return n;
    };

    // ------------------------------------------------------------ navigation

    const shownId = () =>
        page.evaluate(
            () =>
                [...document.querySelectorAll('[data-happy-desktop-ui="retained-view"]')]
                    .find((element) => element.checkVisibility())
                    ?.getAttribute("data-view-id") ?? undefined,
        );
    const view = (agent: Agent) =>
        `[data-happy-desktop-ui="retained-view"][data-view-id="${agent.id}"]`;
    const composer = () =>
        page.locator('[data-happy-desktop-ui="composer-textarea"]:visible').first();
    const viewport = () =>
        page
            .locator('[data-happy-desktop-ui="message-list"]:visible [data-scrollbar-viewport]')
            .first();
    async function open(agent: Agent, how: "sidebar" | "direct" | "palette"): Promise<void> {
        if ((await shownId()) === agent.id) return;
        const row = gym.sessionRows(page, agent.title, agent.id).filter({ visible: true }).first();
        // The palette finds top-level chats; a subtask opens from its row.
        const searchable =
            agent === home || peers.includes(agent) || gym.paletteSessions.includes(agent.title);
        if ((how !== "palette" || !searchable) && (await row.count()) > 0) {
            await gym.switchTo(
                page,
                agent.title,
                undefined,
                how === "direct" ? 0 : gym.hoverMs,
                agent.id,
            );
        } else {
            await page.keyboard.press("Meta+K");
            const search = page.getByPlaceholder("Search chats, workspaces, and settings…");
            await search.waitFor({ timeout: 5_000 });
            await page.keyboard.type(agent.title, { delay: gym.paletteTypeDelayMs });
            // Results highlight what matched, so the title is split across elements.
            await page.waitForFunction(
                (title) =>
                    (
                        document.querySelector('[data-happy-desktop-ui="command-palette-body"]')
                            ?.textContent ?? ""
                    ).includes(title),
                agent.title,
                { timeout: 15_000 },
            );
            await page.waitForTimeout(gym.paletteDwellMs);
            await page.keyboard.press("Enter");
        }
        await page
            .locator(`${view(agent)}:visible [data-happy-desktop-ui="composer-textarea"]`)
            .waitFor({ timeout: 15_000 });
        await page
            .locator(`${view(agent)} [data-happy-desktop-ui="conversation-loading"]`)
            .waitFor({ state: "hidden", timeout: 30_000 });
    }
    const how = (): "sidebar" | "direct" | "palette" => {
        const roll = random();
        return roll < 0.55 ? "sidebar" : roll < 0.8 ? "palette" : "direct";
    };
    async function bottom(): Promise<void> {
        for (let attempt = 0; attempt < 30; attempt += 1) {
            await viewport().hover();
            await page.mouse.wheel(0, 1_000_000);
            await page.waitForTimeout(120);
            if (
                await viewport().evaluate(
                    (element) =>
                        element.scrollHeight - element.clientHeight - element.scrollTop <= 2,
                )
            )
                return;
        }
    }
    const showsText = async (text: string, timeoutMs: number) => {
        const until = Date.now() + timeoutMs;
        while (Date.now() < until) {
            if ((await gym.visibleConversationText(page)).includes(text)) return true;
            await sleep(100);
        }
        return false;
    };

    // ------------------------------------------------------------ actions

    // Stream targets a reader can open: a subtask whose parent is collapsed has no row to press.
    // Filled once the sidebar is on screen.
    const reachable: Agent[] = [];

    let actions = 0;
    const counts = new Map<string, number>();
    /** The reader watches the home chat while its agent finishes run after run. */
    async function follow(runs: number): Promise<void> {
        await open(home, "direct");
        await bottom();
        for (let index = 0; index < runs; index += 1) {
            const n = await apiSend(home.id, pick(texts), false);
            await finish(home.id, 30_000);
            await showsText(tag("R", n), 10_000);
        }
    }
    /** Types a prompt into the composer and sends it; the reply streams while the mix goes on. */
    async function composerSend(targets: readonly Agent[]): Promise<void> {
        for (const target of targets) {
            await finish(target.id);
            await open(target, how());
            const n = (marker += 1);
            await gym.writeReplay(
                target.id,
                gym.streamSource,
                REPLAY_PACE,
                `${tag("R", n)} \n\n${pick(texts)}`,
            );
            const input = composer();
            await input.click();
            await input.fill("");
            const prompt = `${tag("P", n)} Could you check the next part and summarize it?`;
            await page.keyboard.type(prompt, { delay: 12 });
            await page.keyboard.press("Enter");
            sends.push({ agentId: target.id, n, via: "composer" });
            outstanding.set(target.id, n);
            if (!(await showsText(tag("P", n), 10_000))) echoesMissing += 1;
        }
        await open(home, how());
    }
    const DRAFTS = [
        "Draft: check the sidebar while 6 sessions stream 日本語 👩🏽‍💻 e\u0301",
        "Notes for later —\nsecond line, still unsent ✅",
        "Can you look at the composer latency once more?",
    ];
    /** Types a draft into the home chat, leaves, and comes back to it. */
    async function draft(): Promise<void> {
        const text = pick(DRAFTS);
        const away = pick(heavy);
        const keep = random() < 0.2;
        const via = [how(), how()] as const;
        await open(home, "direct");
        const input = composer();
        await input.click();
        await input.fill("");
        // Enter sends; a reader breaks a line with Shift+Enter.
        for (const [index, line] of text.split("\n").entries()) {
            if (index > 0) await page.keyboard.press("Shift+Enter");
            await page.keyboard.type(line, { delay: 15 });
        }
        await open(away, via[0]);
        await open(home, via[1]);
        let shown = "";
        for (let attempt = 0; attempt < 20; attempt += 1) {
            shown = await composer().inputValue();
            if (shown === text) break;
            await sleep(100);
        }
        if (shown !== text) {
            draftsLost.push(
                `${JSON.stringify(text.slice(0, 20))} → ${JSON.stringify(shown.slice(0, 40))} after ${away.title} by ${via.join("/")}`,
            );
            await page
                .screenshot({
                    path: join(gym.scratch, `leak-draft-${String(draftsLost.length)}.png`),
                })
                .catch(() => undefined);
        }
        if (!keep) await composer().fill("");
    }
    /** Looks at one to three other sessions, then goes back to the home chat. */
    async function glance(): Promise<void> {
        const visits = between(1, 3);
        const plan = Array.from({ length: visits }, () => ({
            agent: pick(heavy),
            dwell: between(300, 2500),
            via: how(),
            wheel: random() < 0.3 ? between(3, 20) : 0,
        }));
        for (const visit of plan) {
            await open(visit.agent, visit.via);
            for (let notch = 0; notch < visit.wheel; notch += 1) {
                await page.mouse.wheel(0, -300);
                await page.waitForTimeout(16);
            }
            await page.waitForTimeout(visit.dwell);
        }
        await open(home, how());
    }
    /** Flicks up through history, sometimes to the very top, then back to the newest. */
    async function scroll(): Promise<void> {
        const where = random() < 0.6 ? home : pick(heavy);
        const notches = between(20, 200);
        const toTop = random() < 0.25;
        await open(where, how());
        await viewport().hover();
        for (let notch = 0; notch < notches; notch += 1) {
            await page.mouse.wheel(0, -300);
            await page.waitForTimeout(16);
        }
        if (toTop) {
            for (let attempt = 0; attempt < 30; attempt += 1) {
                await page.mouse.wheel(0, -1_000_000);
                await page.waitForTimeout(250);
            }
        }
        await page.waitForTimeout(800);
        await bottom();
        if (where !== home) await open(home, how());
    }
    /** Starts recorded runs streaming in sessions nobody is looking at. */
    async function background(): Promise<void> {
        const count = between(1, 4);
        const targets = Array.from({ length: count }, () => ({
            target: pick(streams),
            text: pick(texts),
        }));
        const seen = new Set<string>();
        for (const { target, text } of targets) {
            if (seen.has(target.id)) continue;
            seen.add(target.id);
            await apiSend(target.id, text, true);
        }
    }
    /** Goes to a session streaming out of sight, watches, and comes back. */
    async function returnTo(): Promise<void> {
        const target = pick(reachable);
        const dwell = between(1000, 3000);
        const text = pick(texts);
        if (!outstanding.has(target.id)) await apiSend(target.id, text, true);
        await open(target, how());
        await page.waitForTimeout(dwell);
        await open(home, how());
    }
    /** Rapid switching between the home chat and three others while sessions stream. */
    async function stress(): Promise<void> {
        const others = [pick(heavy), pick(reachable), pick(heavy)];
        const steps = between(12, 30);
        const dwells = Array.from({ length: steps }, () => between(120, 300));
        if (outstanding.size === 0) await background();
        for (let step = 0; step < steps; step += 1) {
            await open(step % 2 === 0 ? others[(step / 2) % 3]! : home, "sidebar");
            await page.waitForTimeout(dwells[step]!);
        }
        await open(home, "direct");
    }
    /** Sends into several sessions one after another without waiting for any reply. */
    async function rapid(): Promise<void> {
        const count = between(2, 3);
        const targets = [home, ...Array.from({ length: count - 1 }, () => pick(reachable))];
        await composerSend([...new Set(targets)]);
    }
    const MIX: readonly (readonly [string, number, () => Promise<void>])[] = [
        ["follow", 26, async () => await follow(between(4, 16))],
        ["send", 12, async () => await composerSend([random() < 0.7 ? home : pick(reachable)])],
        ["draft", 8, draft],
        ["glance", 20, glance],
        ["scroll", 9, scroll],
        ["background", 10, background],
        ["return", 7, returnTo],
        ["stress", 4, stress],
        ["rapid", 4, rapid],
    ];
    const totalWeight = MIX.reduce((total, [, weight]) => total + weight, 0);
    const nextAction = () => {
        let roll = random() * totalWeight;
        for (const entry of MIX) {
            roll -= entry[1];
            if (roll < 0) return entry;
        }
        return MIX[0]!;
    };
    const failure = (error: unknown) => (error as Error).message.split("\n")[0]!.slice(0, 200);
    async function act(name: string, work: () => Promise<void>): Promise<void> {
        actions += 1;
        counts.set(name, (counts.get(name) ?? 0) + 1);
        try {
            await work();
        } catch (error) {
            harnessErrors.push(`${name}: ${failure(error)}`);
            console.log(`leak: ${harnessErrors.at(-1)!}`);
            if (harnessErrors.length <= 5)
                await page
                    .screenshot({
                        path: join(gym.scratch, `leak-error-${String(harnessErrors.length)}.png`),
                    })
                    .catch(() => undefined);
            await page.keyboard.press("Escape").catch(() => undefined);
            await open(home, "palette").catch(() => undefined);
        }
    }

    // ------------------------------------------------------------ warm-up steps

    /**
     * Reads the open session back to its first message, or for a minute at most, so the older
     * pages glances and scrolls load later are pages a reader has already loaded and left.
     */
    async function pageToTop(): Promise<void> {
        await viewport().hover();
        let height = -1;
        let still = 0;
        for (let attempt = 0; attempt < 120 && still < 6; attempt += 1) {
            await page.mouse.wheel(0, -1_000_000);
            await page.waitForTimeout(500);
            const now = await viewport().evaluate((element) =>
                element.scrollTop <= 2 ? element.scrollHeight : -1,
            );
            still = now !== -1 && now === height ? still + 1 : 0;
            height = now;
        }
    }
    /**
     * Opens every heavy session in a row and reads each back to its start, so the views kept for
     * the earlier ones are let go and every session has already held its older pages once.
     */
    async function tour(): Promise<void> {
        const order = [...heavy].sort(() => random() - 0.5);
        for (const agent of order) {
            try {
                await open(agent, how());
                await pageToTop();
                await bottom();
            } catch (error) {
                harnessErrors.push(`tour: ${failure(error)} (${agent.title})`);
                console.log(`leak: ${harnessErrors.at(-1)!}`);
                await page.keyboard.press("Escape");
            }
        }
        await open(home, "direct");
        await bottom();
    }
    async function reloadPage(): Promise<void> {
        await page.reload();
        await page
            .locator('[data-happy-desktop-ui="sidebar-item"]')
            .first()
            .waitFor({ timeout: 30_000 });
        await open(home, "palette");
        await bottom();
    }
    const daemonStart = process.env.PERF_DAEMON_START;
    /** Drains and shuts the daemon down, and starts it again over the same data. */
    async function restartDaemon(): Promise<void> {
        if (daemonStart === undefined) return;
        await quiesce();
        restartingUntil = Infinity;
        await daemon("POST", "/v0/drain");
        for (let index = 0; index < 600; index += 1) {
            const health = await daemon<{ drainWaitingFor?: unknown[] }>("GET", "/v0/health");
            if ((health.drainWaitingFor ?? []).length === 0) break;
            await sleep(50);
        }
        const { pid } = await daemon<{ pid: number }>("POST", "/v0/shutdown");
        for (let index = 0; index < 600; index += 1) {
            try {
                process.kill(pid, 0);
            } catch {
                break;
            }
            await sleep(20);
        }
        const log = openSync(join(gym.scratch, "restart.log"), "a");
        spawn("zsh", ["-c", daemonStart], { detached: true, stdio: ["ignore", log, log] }).unref();
        for (let index = 0; ; index += 1) {
            if (
                (await daemon<{ ready: boolean }>("GET", "/v0/health").catch(() => undefined))
                    ?.ready === true
            )
                break;
            if (index > 1200) {
                restartingUntil = 0;
                throw new Error("The restarted daemon never became ready.");
            }
            await sleep(50);
        }
        restartingUntil = Date.now() + 20_000;
        const pidFile = process.env.PERF_DAEMON_PIDFILE;
        if (pidFile !== undefined) gym.daemonPidSet((await readFile(pidFile, "utf8")).trim());
        await page.waitForTimeout(3000);
    }
    /** Fills the home chat's prepared-text caches to their budget with paragraphs seen once each. */
    const WORDS =
        "the a session stream reader layout cache history page sidebar composer draft reply prompt daemon window view row height text tree prepared settled follow trim older newest message tool output run agent workspace switch palette search scroll anchor frame budget bound entry key value index order".split(
            " ",
        );
    async function saturate(): Promise<void> {
        await open(home, "direct");
        await bottom();
        for (let run = 0; run < SATURATE_RUNS; run += 1) {
            const paragraphs = Array.from(
                { length: 40 },
                () => Array.from({ length: between(20, 30) }, () => pick(WORDS)).join(" ") + ".",
            );
            await apiSend(home.id, paragraphs.join("\n\n"), false, FAST_PACE);
            await finish(home.id, 60_000);
        }
    }

    // ------------------------------------------------------------ sampling

    const samples: Sample[] = [];
    let measureStart = Date.now();
    const minuteNow = () => (Date.now() - measureStart) / 60_000;
    async function sample(phase: Sample["phase"]): Promise<Sample | undefined> {
        await quiesce();
        try {
            // A fixed walk: the views and layout caches that remain are the same at every sample.
            for (const agent of [
                peers[0]!,
                peers[1]!,
                peers[2]!,
                home,
                peers[3]!,
                peers[4]!,
                peers[5]!,
                home,
                peers[6]!,
                home,
            ])
                await open(agent, "direct");
            await bottom();
        } catch (error) {
            harnessErrors.push(`sample: ${failure(error)}`);
            console.log(`leak: ${harnessErrors.at(-1)!}; sample skipped`);
            await page
                .screenshot({
                    path: join(
                        gym.scratch,
                        `leak-sample-error-${String(harnessErrors.length)}.png`,
                    ),
                })
                .catch(() => undefined);
            await page.keyboard.press("Escape").catch(() => undefined);
            return undefined;
        }
        await page.waitForTimeout(500);
        await cdp.send("HeapProfiler.collectGarbage");
        await cdp.send("HeapProfiler.collectGarbage");
        const heap = await cdp.send("Runtime.getHeapUsage");
        const counters = await cdp.send("Memory.getDOMCounters");
        const sizes = await page.evaluate(componentSizes);
        const taken: Sample = {
            actions,
            daemon: await probe<ProcessMemory>("daemon", "/memory"),
            minute: minuteNow(),
            phase,
            renderer: {
                domNodes: counters.nodes,
                heapMB: heap.usedSize / MB,
                listeners: counters.jsEventListeners,
                ...sizes,
            },
            web: await probe<ProcessMemory>("web", "/memory"),
        };
        samples.push(taken);
        console.log(
            `leak ${phase} ${taken.minute.toFixed(1).padStart(5)} min ${String(actions).padStart(5)} actions | renderer ${(heap.usedSize / MB).toFixed(1)} MB dom ${String(counters.nodes)} listeners ${String(counters.jsEventListeners)} fibers ${String(sizes.fibers)} views ${String(sizes.retainedViews)} trees ${String(sizes.textTrees)} prepared ${String(sizes.preparedKB)}+${String(sizes.streamingPreparedKB)} KB | daemon ${taken.daemon === undefined ? "-" : `${(taken.daemon.heapUsed / MB).toFixed(1)} MB heap ${(taken.daemon.rss / MB).toFixed(0)} MB rss`} | web ${taken.web === undefined ? "-" : `${(taken.web.heapUsed / MB).toFixed(1)} MB heap ${(taken.web.rss / MB).toFixed(0)} MB rss`}`,
        );
        return taken;
    }

    // The first snapshots are taken as measuring starts, the second ones at the end only for a
    // process that grew. Sampling heap profiles run in between.
    const snapshots: Record<string, string> = {};
    async function rendererSnapshot(name: string): Promise<string> {
        const path = join(gym.scratch, `leak-renderer-${name}.heapsnapshot`);
        await cdp.send("HeapProfiler.enable");
        await cdp.send("HeapProfiler.collectGarbage");
        const file = createWriteStream(path);
        const write = ({ chunk }: { chunk: string }) => file.write(chunk);
        cdp.on("HeapProfiler.addHeapSnapshotChunk", write);
        await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
        cdp.off("HeapProfiler.addHeapSnapshotChunk", write);
        await new Promise((resolve) => file.end(resolve));
        return path;
    }
    async function firstSnapshots(): Promise<void> {
        snapshots.renderer = await rendererSnapshot("first");
        await cdp.send("HeapProfiler.startSampling", { samplingInterval: 32_768 });
        for (const role of ["daemon", "web"]) {
            const path = join(gym.scratch, `leak-${role}-first.heapsnapshot`);
            if (
                (await probe(role, `/snapshot?path=${encodeURIComponent(path)}`, "POST")) ===
                undefined
            )
                continue;
            snapshots[role] = path;
            await probe(role, "/sampling/start", "POST");
        }
    }

    // ------------------------------------------------------------ warm-up

    // The copied profile acknowledged the welcome on its own origin; a run on another port has not.
    await page.addInitScript(() =>
        localStorage.setItem("happy.welcome.v1", JSON.stringify({ welcomeAcknowledged: true })),
    );
    await page.goto(gym.url);
    await page
        .locator('[data-happy-desktop-ui="sidebar-item"]')
        .first()
        .waitFor({ timeout: 30_000 })
        .catch(async (error: unknown) => {
            await page.screenshot({ path: join(gym.scratch, "leak-start-failed.png") });
            throw error;
        });
    for (const target of streams)
        if ((await gym.sessionRows(page, target.title, target.id).count()) > 0)
            reachable.push(target);
    if (reachable.length === 0) reachable.push(home);
    console.log(
        `leak: stream targets with a row: ${reachable.map((agent) => agent.title).join(", ")}`,
    );
    const step = (name: string) =>
        console.log(`leak: warm-up ${name} (${minuteNow().toFixed(1)} min)`);
    // Restored sessions may resume a predecessor run on their first send; settle that before auditing.
    for (const agent of [home, ...streams]) {
        const n = (marker += 1);
        // The first send in a new mode may spend an inference before its own run; every one answers alike.
        const ready = { blocks: [{ text: `${tag("W", n)} Ready.`, type: "text" }] };
        await writeFile(
            join(gym.scratch, "replay", `${agent.id}.json`),
            JSON.stringify({ chunk: 32, delayMs: 4, inferences: [ready, ready, ready] }),
        );
        await daemon("POST", `/v0/agents/${agent.id}/send`, { mode: MODE, text: "Warm-up." });
        for (let index = 0; index < 240 && !(await replyStored(agent.id, n, "W")); index += 1)
            await sleep(250);
    }
    await open(home, "palette");
    step("reload");
    await act("reload", reloadPage);
    step("restart");
    await act("restart", restartDaemon);
    step(`${String(PREFILL_STREAM_RUNS)} replays into each stream target`);
    // Texts are drawn in order rather than at random: the targets fill in parallel.
    await Promise.all(
        streams.map(async (target, index) => {
            for (let run = 0; run < PREFILL_STREAM_RUNS; run += 1) {
                await apiSend(
                    target.id,
                    texts[(run * streams.length + index) % texts.length]!,
                    true,
                    FAST_PACE,
                );
                await finish(target.id, 180_000);
            }
        }),
    );
    step("tour");
    await act("tour", tour);
    for (const peer of peers) await act("peer", async () => await open(peer, "direct"));
    step(`${String(SATURATE_RUNS)} replies of new paragraphs into the home chat`);
    await act("saturate", saturate);
    step(`${String(PREFILL_HOME_RUNS)} runs into the home chat`);
    await act("prefill", async () => {
        await open(home, "direct");
        await bottom();
        for (let run = 0; run < PREFILL_HOME_RUNS; run += 1) {
            const n = await apiSend(
                home.id,
                pick(texts),
                run % RECORDED_EVERY === RECORDED_EVERY - 1,
                FAST_PACE,
            );
            await finish(home.id, 60_000);
            await showsText(tag("R", n), 10_000);
        }
    });
    step(`${String(WARMUP_MINUTES)} min of the mix`);
    const warmupEnd = Date.now() + WARMUP_MINUTES * 60_000;
    let nextSample = Date.now();
    while (Date.now() < warmupEnd) {
        if (Date.now() >= nextSample) {
            await sample("warmup");
            nextSample = Date.now() + SAMPLE_MS;
        }
        const [name, , work] = nextAction();
        await act(name, work);
    }

    // ------------------------------------------------------------ measured phase

    // A process keeps the memory a heap snapshot took, so the first ones are taken before measuring.
    await quiesce();
    await firstSnapshots();
    measureStart = Date.now();
    const actionsAtStart = actions;
    nextSample = Date.now();
    while (minuteNow() < MINUTES) {
        if (Date.now() >= nextSample) {
            await sample("measure");
            nextSample = Date.now() + SAMPLE_MS;
            continue;
        }
        const [name, , work] = nextAction();
        await act(name, work);
    }
    await sample("measure");
    const measuredMinutes = minuteNow();
    const measuredActions = actions - actionsAtStart;

    // ------------------------------------------------------------ verdict

    const measured = samples.filter((s) => s.phase === "measure");
    const series = (read: (sample: Sample) => number | undefined): LeakSample[] =>
        measured.flatMap((s) => {
            const value = read(s);
            return value === undefined || !Number.isFinite(value)
                ? []
                : [{ actions: s.actions - actionsAtStart, minute: s.minute, value }];
        });
    const metrics = [
        { name: "renderer heap", samples: series((s) => s.renderer.heapMB), unit: "MB" },
        { name: "renderer dom nodes", samples: series((s) => s.renderer.domNodes), unit: "nodes" },
        {
            name: "renderer listeners",
            samples: series((s) => s.renderer.listeners),
            unit: "listeners",
        },
        { name: "renderer fibers", samples: series((s) => s.renderer.fibers), unit: "fibers" },
        {
            name: "renderer text trees",
            samples: series((s) => s.renderer.textTrees),
            unit: "trees",
        },
        {
            name: "daemon heap",
            samples: series((s) => (s.daemon === undefined ? undefined : s.daemon.heapUsed / MB)),
            unit: "MB",
        },
        {
            name: "daemon rss",
            samples: series((s) => (s.daemon === undefined ? undefined : s.daemon.rss / MB)),
            unit: "MB",
        },
        { name: "daemon handles", samples: series((s) => s.daemon?.handles), unit: "handles" },
        {
            name: "web heap",
            samples: series((s) => (s.web === undefined ? undefined : s.web.heapUsed / MB)),
            unit: "MB",
        },
        {
            name: "web rss",
            samples: series((s) => (s.web === undefined ? undefined : s.web.rss / MB)),
            unit: "MB",
        },
    ].filter((metric) => metric.samples.length > 0);
    const verdicts: LeakVerdict[] = metrics.map((metric) =>
        leakVerdict({ ...metric, perHour: LIMITS[metric.name]! }),
    );

    // Cause summaries for every process that grew past its limit, plateau or not.
    const causes: string[] = [];
    const grew = (role: string) =>
        verdicts.some(
            (verdict) =>
                verdict.name.startsWith(role) &&
                verdict.status !== "PASS" &&
                verdict.status !== "NO DATA",
        );
    for (const role of ["renderer", "daemon", "web"] as const) {
        if (!grew(role) || snapshots[role] === undefined) continue;
        let second: string | undefined;
        let profile: unknown;
        if (role === "renderer") {
            profile = (await cdp.send("HeapProfiler.getSamplingProfile")).profile;
            second = await rendererSnapshot("last");
        } else {
            profile = await probe(role, "/sampling");
            const path = join(gym.scratch, `leak-${role}-last.heapsnapshot`);
            second = (
                await probe<{ path: string }>(
                    role,
                    `/snapshot?path=${encodeURIComponent(path)}`,
                    "POST",
                )
            )?.path;
        }
        if (second === undefined) continue;
        const growth = heapGrowth(
            await heapSnapshotRead(snapshots[role]!),
            await heapSnapshotRead(second),
        );
        causes.push(
            ...heapGrowthLines(
                `${role} cause`,
                growth,
                profile === undefined ? [] : samplingSites(profile as never),
            ),
        );
    }

    // A last restart: the audit then reads what the new process restored, and the open chat must
    // show its newest reply again.
    await quiesce();
    const restartProblems: string[] = [];
    const lastHome = [...sends]
        .reverse()
        .find((send) => send.agentId === home.id && send.aborted !== true);
    try {
        await restartDaemon();
        await open(home, "direct");
        if (lastHome !== undefined && !(await showsText(tag("R", lastHome.n), 30_000)))
            restartProblems.push(
                `the home chat does not show ${tag("R", lastHome.n)} after the restart`,
            );
    } catch (error) {
        restartProblems.push(failure(error));
    }

    // Persistence: every audited prompt and reply stored exactly once, the reply in its prompt's run.
    const problems: string[] = [];
    const audited = new Map<string, typeof sends>();
    for (const send of sends)
        audited.set(send.agentId, [...(audited.get(send.agentId) ?? []), send]);
    for (const [agentId, expected] of audited) {
        const prompts = new Map<number, Set<string>>();
        const replies = new Map<number, Set<string>>();
        const runOf = new Map<string, string>();
        const seen = new Set<string>();
        let before: string | undefined;
        for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
            const history = await daemon<{ runs: Run[]; hasMore: boolean }>(
                "GET",
                `/v0/agents/${agentId}/messages?limit=200&omitToolData=true${before === undefined ? "" : `&before=${before}`}`,
            );
            for (const run of history.runs) {
                for (const [index, message] of run.messages.entries()) {
                    const id = message.id ?? `${run.id}:${String(index)}`;
                    if (seen.has(id)) continue;
                    seen.add(id);
                    for (const match of JSON.stringify(message.content).matchAll(
                        /LEAK_([PR])_(\d+)_(\d+)/g,
                    )) {
                        if (Number(match[2]) !== seed) continue;
                        const n = Number(match[3]);
                        const into =
                            match[1] === "P" && message.role === "user"
                                ? prompts
                                : match[1] === "R" && message.role !== "user"
                                  ? replies
                                  : undefined;
                        if (into === undefined) continue;
                        into.set(n, (into.get(n) ?? new Set()).add(id));
                        runOf.set(`${match[1]!}${String(n)}`, run.id);
                    }
                }
            }
            const oldest = Math.min(...expected.map((send) => send.n));
            if (!history.hasMore || history.runs[0] === undefined || prompts.has(oldest)) break;
            before = history.runs[0].id;
        }
        for (const send of expected) {
            const promptCount = prompts.get(send.n)?.size ?? 0;
            const replyCount = replies.get(send.n)?.size ?? 0;
            if (promptCount !== 1)
                problems.push(
                    `${tag("P", send.n)} (${send.via}) stored ${String(promptCount)} times in ${agentId}`,
                );
            if (send.aborted === true) continue;
            if (replyCount !== 1)
                problems.push(
                    `${tag("R", send.n)} (${send.via}) stored ${String(replyCount)} times in ${agentId}`,
                );
            else if (runOf.get(`R${String(send.n)}`) !== runOf.get(`P${String(send.n)}`))
                problems.push(`${tag("R", send.n)} is not in its prompt's run in ${agentId}`);
        }
    }

    // ------------------------------------------------------------ report

    const capped = measured.every((s) => s.daemon === undefined || s.daemon.requestLogCapped);
    const correctness = [
        { name: "persistence", problems },
        { name: "restart", problems: restartProblems },
        { name: "drafts", problems: draftsLost },
        {
            name: "echo",
            problems:
                echoesMissing === 0 ? [] : [`${String(echoesMissing)} sent prompts never shown`],
        },
        { name: "page errors", problems: pageErrors },
        { name: "server errors", problems: serverErrors },
        {
            name: "harness",
            problems: harnessErrors.length > Math.max(5, actions / 50) ? harnessErrors : [],
        },
    ];
    const failed =
        verdicts.some((verdict) => verdict.status === "FAIL" || verdict.status === "NO DATA") ||
        correctness.some((check) => check.problems.length > 0);
    const detail: Record<string, string> = {
        persistence: `${String(sends.length)} prompts and replies stored exactly once, read after a restart`,
        restart: "the open chat shows its newest reply again",
    };
    const lines = [
        `== leak ${gym.label} seed ${String(seed)}: ${String(measuredActions)} actions in ${measuredMinutes.toFixed(1)} min measured (${[...counts].map(([name, count]) => `${name} ${String(count)}`).join(", ")} in all), ${String(sends.length)} audited sends, ${String(measured.length)} samples`,
        ...verdicts.map(leakVerdictLine),
        ...correctness.map(
            (check) =>
                `${check.name.padEnd(26)} ${check.problems.length === 0 ? "PASS" : "FAIL"}    ${check.problems.length === 0 ? (detail[check.name] ?? "") : `${String(check.problems.length)}: ${check.problems.slice(0, 4).join("; ")}`}`,
        ),
        ...(capped
            ? []
            : [
                  "note: the daemon's scripted-inference request log was not capped; daemon memory includes it",
              ]),
        ...(harnessErrors.length > 0
            ? [
                  `harness: ${String(harnessErrors.length)} recovered action errors, first: ${harnessErrors[0]!}`,
              ]
            : []),
        ...causes,
        `leak verdict: ${failed ? "FAIL" : "PASS"} (seed ${String(seed)})`,
    ];
    for (const line of lines) console.log(line);
    await writeFile(
        gym.out,
        JSON.stringify(
            {
                at: new Date().toISOString(),
                causes,
                correctness,
                counts: Object.fromEntries(counts),
                label: gym.label,
                mode: "leak",
                ok: !failed,
                samples,
                seed,
                verdicts,
            },
            null,
            2,
        ),
    );
    return failed ? 1 : 0;
}
