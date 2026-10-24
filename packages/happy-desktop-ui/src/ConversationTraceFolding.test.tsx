import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { expect, it, vi } from "vitest";
import {
    happyAgentChatStoreCreate,
    type ChatElement,
    type ConversationAuthor,
    type HappyAgentSessionId,
    type SessionState,
} from "happy-desktop-state";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { createRenderer } from "./testing";

/* A finished turn folds its work away only once none of it is on screen: the
 * reader never watches rows they are reading disappear, not when the turn
 * ends, not when they steer it, and not when it scrolls out of view. The real
 * chat store drives the real view here, so the store's bookkeeping and the
 * view's report of what is on screen are tested together. */

const agent: ConversationAuthor = {
    id: "trace-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const catalog = {
    defaultModelId: "model",
    defaultProviderId: "provider",
    models: [],
    providers: [],
};
const session = (running: boolean): SessionState => ({
    activity: running
        ? { kind: "executing_tool_call", label: "Working", since: 0 }
        : { kind: "idle", label: "Idle", since: 0 },
    status: running ? "running" : "idle",
    archived: false,
    sessionId: "trace-agent",
    ownerInstanceId: "instance",
    scope: { kind: "unsorted" },
    cwd: "",
    modelId: "model",
    providerId: "provider",
    titleStatus: "idle",
    permissionMode: "auto",
    modelLocked: false,
    modelCatalog: catalog,
    models: [],
    pendingUserInputs: [],
    answeredUserInputs: [],
    pendingSteeringMessages: [],
    slashCommands: [],
    tasks: [],
    subagents: [],
    backgroundProcesses: [],
    connection: "live",
    transcriptComplete: true,
    loadingMore: false,
});

let clock = 1_000;
function prompt(groupId: string, text: string): ChatElement {
    clock += 1;
    return {
        id: `${groupId}:user`,
        groupId,
        runId: `run-${groupId}`,
        createdAt: clock,
        kind: "user_message",
        messageId: `${groupId}:user`,
        authority: "server",
        identity: null,
        delivery: "sent",
        text,
    };
}
function step(groupId: string, index: number): ChatElement {
    clock += 1;
    return {
        id: `${groupId}:tool-${String(index)}`,
        groupId,
        runId: `run-${groupId}`,
        createdAt: clock,
        kind: "tool_call",
        toolCallId: `${groupId}:call-${String(index)}`,
        name: "exec_command",
        arguments: { cmd: `pnpm test --filter ${groupId}-step-${String(index)}` },
        argumentsComplete: true,
        status: "succeeded",
        presentation: {
            kind: "command",
            command: `pnpm test --filter ${groupId}-step-${String(index)}`,
        },
    } as ChatElement;
}
function answer(groupId: string, text: string): ChatElement {
    clock += 1;
    return {
        id: `${groupId}:answer`,
        groupId,
        runId: `run-${groupId}`,
        createdAt: clock,
        kind: "agent_text",
        messageId: `${groupId}:answer`,
        text,
        complete: true,
    };
}
function end(groupId: string, reason: "completed" | "steering" = "completed"): ChatElement {
    clock += 1;
    return {
        id: `group-end:${groupId}`,
        groupId,
        runId: `run-${groupId}`,
        createdAt: clock,
        kind: "group_end",
        outcome: "success",
        reason,
        startedAt: clock - 500,
        endedAt: clock,
        elapsedMs: 500,
        turnStartedAt: clock - 500,
        turnElapsedMs: 500,
        modelTurn: true,
    };
}
/** A finished turn: prompt, `steps` tool calls, and an answer. */
function turn(groupId: string, steps: number): ChatElement[] {
    return [
        prompt(groupId, `Prompt ${groupId}: check the build and report back.`),
        ...Array.from({ length: steps }, (_, index) => step(groupId, index)),
        answer(groupId, `Answer ${groupId}. ${"The build is green and nothing moved. ".repeat(4)}`),
        end(groupId),
    ];
}

function renderChat(history: readonly ChatElement[]) {
    let change!: (elements: readonly ChatElement[], running: boolean) => void;
    const store = happyAgentChatStoreCreate("trace-agent" as HappyAgentSessionId, {
        catalog,
        transcriptConnect: (options) => {
            change = (elements, running) => options.onChange(elements, session(running), []);
            return { close: () => undefined, loadMore: () => undefined };
        },
        connectActions: {} as never,
        connectMutationSubscribe: () => () => undefined,
    });
    let elements = history;
    let running = false;
    function Harness() {
        const snapshot = useSyncExternalStore(store.subscribe, store.get);
        return (
            <div style={{ height: 700, width: 880 }}>
                <ConversationView
                    agentAuthor={agent}
                    conversationId="trace-folding"
                    entries={snapshot.entries}
                    expandedTurnIds={snapshot.expandedTurnIds}
                    motion="calm"
                    onTracesSeen={store.turnTracesSeen}
                    onTraceToggle={store.turnTraceToggle}
                    running={snapshot.runStatus === "running"}
                />
            </div>
        );
    }
    const view = createRenderer();
    view.render(Harness, { height: 900, width: 1000 });
    flushSync(() => change(elements, running));
    return {
        view,
        store,
        /** Appends elements as one transcript read. */
        push(...next: ChatElement[]) {
            elements = [...elements, ...next];
            running = next.at(-1)?.kind !== "group_end";
            flushSync(() => change(elements, running));
        },
    };
}

const frames = async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};
function viewportOf(view: ReturnType<typeof createRenderer>) {
    return view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
}
function rowsOf(viewport: HTMLElement) {
    return [...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")];
}
function rowWith(viewport: HTMLElement, text: string) {
    return rowsOf(viewport).find((row) => row.textContent?.includes(text));
}
/**
 * Where a row's content starts: its first glyph, and what that glyph begins.
 * A row that gains a header, or remounts its body somewhere else, moves this
 * even when the row's own box stays put.
 */
function rowContent(row: HTMLElement): string {
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim();
        if (!text) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        return `${text.slice(0, 12)}@${String(Math.round(range.getBoundingClientRect().top))}`;
    }
    return "";
}
/** Every row at least partly on screen, each a row React keeps by key, with its top edge. */
function visibleRows(viewport: HTMLElement): Map<HTMLElement, number> {
    const bounds = viewport.getBoundingClientRect();
    const rows = new Map<HTMLElement, number>();
    for (const row of rowsOf(viewport)) {
        const rect = row.getBoundingClientRect();
        if (rect.bottom <= bounds.top || rect.top >= bounds.bottom || rect.height === 0) continue;
        rows.set(row, rect.top);
    }
    return rows;
}
/** The content of every row on screen, as `rowContent` reads it. */
function visibleContent(viewport: HTMLElement): Map<HTMLElement, string> {
    return new Map([...visibleRows(viewport).keys()].map((row) => [row, rowContent(row)]));
}
const label = (row: HTMLElement) => row.textContent?.slice(0, 60);

it("keeps every row of a steered turn where it was until all of it scrolls away", async () => {
    const { view, store, push } = renderChat([...turn("a", 6), ...turn("b", 6)]);
    await view.ready();
    await frames();
    const viewport = viewportOf(view);
    // History arrives folded.
    expect(store.get().expandedTurnIds.size).toBe(0);
    expect(rowWith(viewport, "a-step-0")).toBeUndefined();

    // A turn runs while the reader watches it, then they steer it.
    push(prompt("live", "Prompt live: run every step."));
    for (let index = 0; index < 8; index += 1) push(step("live", index));
    await frames();
    // Parked a little above the bottom, so every row keeps its exact place.
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -120 }));
    viewport.scrollTop -= 120;
    await frames();
    const watched = visibleRows(viewport);
    const watchedContent = visibleContent(viewport);
    expect([...watched.keys()].some((row) => row.textContent?.includes("live-step-0"))).toBe(true);

    push(end("live", "steering"), prompt("steer", "Actually, stop after the tests."));
    await frames();
    expect(store.get().expandedTurnIds).toEqual(new Set(["live"]));
    const after = visibleRows(viewport);
    for (const [row, top] of watched)
        expect([label(row), row.isConnected, after.get(row)]).toEqual([label(row), true, top]);
    // Nor does anything inside them: no row gains a header for the turn ending.
    const afterContent = visibleContent(viewport);
    for (const [row, content] of watchedContent)
        expect([label(row), afterContent.get(row)]).toEqual([label(row), content]);

    // The steered work goes on below; the reader follows it down. Step by
    // step nothing on screen jumps, and the turn folds once it is all gone.
    push(...Array.from({ length: 60 }, (_, index) => step("steer", index)));
    await frames();
    for (let guard = 0; guard < 80 && store.get().expandedTurnIds.size > 0; guard += 1) {
        const before = visibleRows(viewport);
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 90 }));
        viewport.scrollTop += 90;
        await frames();
        const now = visibleRows(viewport);
        /* Every row still on screen moved by the same distance, the distance
           scrolled: folding the turn above took nothing out from under them. */
        const moves = [...now]
            .filter(([row]) => before.has(row))
            .map(([row, top]) => [label(row), Math.round(before.get(row)! - top)] as const);
        const moved = moves[0]?.[1] ?? 0;
        expect(moves).toEqual(moves.map(([row]) => [row, moved]));
        expect(moved).toBeLessThanOrEqual(90);
        if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 1) break;
    }
    expect(store.get().expandedTurnIds.size).toBe(0);
    // Folded off screen: its steps are gone when the reader goes back to it.
    viewport.scrollTop = 0;
    await frames();
    for (let guard = 0; guard < 40 && !rowWith(viewport, "Prompt live"); guard += 1) {
        viewport.scrollTop += 300;
        await frames();
    }
    expect(rowWith(viewport, "Prompt live")).toBeDefined();
    // A turn the steer cut short has no answer, so its last step stays standing for it.
    expect(rowWith(viewport, "live-step-0")).toBeUndefined();
    expect(rowWith(viewport, "live-step-7")?.textContent).toContain("View traces");
});

it("changes nothing on screen when a watched turn finishes with an answer", async () => {
    const { view, store, push } = renderChat([...turn("a", 6), ...turn("b", 6)]);
    await view.ready();
    await frames();
    const viewport = viewportOf(view);
    push(prompt("live", "Prompt live: run every step."));
    for (let index = 0; index < 6; index += 1) push(step("live", index));
    push(answer("live", `Answer live. ${"Every step passed and nothing moved. ".repeat(4)}`));
    await frames();
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -60 }));
    viewport.scrollTop -= 60;
    await frames();
    const watched = visibleContent(viewport);
    expect([...watched.keys()].some((row) => row.textContent?.includes("Answer live"))).toBe(true);

    push(end("live"));
    await frames();
    expect(store.get().expandedTurnIds).toEqual(new Set(["live"]));
    const after = visibleContent(viewport);
    for (const [row, content] of watched)
        expect([label(row), row.isConnected, after.get(row)]).toEqual([label(row), true, content]);
    // The footer the end brought offers to hide the steps.
    // Laid out once idle time reaches it, like any row arriving below the reader.
    viewport.scrollTop = viewport.scrollHeight;
    await vi.waitFor(() =>
        expect(
            rowsOf(viewport)
                .reverse()
                .find((row) => row.textContent?.includes("Completed"))?.textContent,
        ).toContain("Hide traces"),
    );
    const footer = rowsOf(viewport)
        .reverse()
        .find((row) => row.textContent?.includes("Completed"))!;
    footer.querySelector<HTMLButtonElement>("button[aria-expanded]")!.click();
    await frames();
    expect(store.get().expandedTurnIds.size).toBe(0);
    expect(rowWith(viewport, "live-step-0")).toBeUndefined();
});

it("keeps the rows of a turn steered at the bottom on screen while it follows", async () => {
    const { view, store, push } = renderChat([...turn("a", 6)]);
    await view.ready();
    await frames();
    const viewport = viewportOf(view);
    push(prompt("live", "Prompt live: run every step."));
    for (let index = 0; index < 14; index += 1) {
        push(step("live", index));
        await frames();
    }
    const watched = visibleRows(viewport);
    expect([...watched.keys()].some((row) => row.textContent?.includes("live-step-13"))).toBe(true);

    push(end("live", "steering"), prompt("steer", "Actually, stop after the tests."));
    await frames();
    push(step("steer", 0));
    await frames();
    expect(store.get().expandedTurnIds).toEqual(new Set(["live"]));
    // Following carries everything up together; nothing on screen leaves it
    // early or moves against its neighbours.
    const now = visibleRows(viewport);
    const moves = [...watched]
        .filter(([row]) => now.has(row))
        .map(([row, top]) => [label(row), Math.round(top - now.get(row)!)] as const);
    expect(moves.length).toBeGreaterThan(watched.size / 2);
    expect(moves).toEqual(moves.map(([row]) => [row, moves[0]![1]]));
    expect(rowWith(viewport, "live-step-13")).toBeDefined();
});

it("opens and closes a folded turn from one place", async () => {
    const { view, store } = renderChat([
        ...turn("a", 6),
        ...turn("b", 6),
        ...turn("c", 6),
        ...turn("d", 6),
        ...turn("e", 6),
    ]);
    await view.ready();
    await frames();
    const viewport = viewportOf(view);
    // Parked with the turn's prompt above its answer, so following the end
    // holds nothing: what keeps the control in place is the control.
    const offset =
        rowWith(viewport, "Prompt c:")!.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top -
        80;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: offset }));
    viewport.scrollTop += offset;
    await frames();
    const control = (label: string) =>
        [...viewport.querySelectorAll<HTMLElement>("button")].find(
            (button) =>
                button.textContent?.includes(label) &&
                button
                    .closest(".happy-message-list__virtual-row")
                    ?.textContent?.includes("Answer c"),
        );
    const view0 = control("View traces")!;
    expect(view0).toBeDefined();
    const place = view0.getBoundingClientRect();
    /** The control under the pointer, clicked where the reader's pointer is. */
    const pointed = () =>
        document
            .elementFromPoint(place.x + place.width / 2, place.y + place.height / 2)
            ?.closest("button");
    expect(pointed()).toBe(view0);
    pointed()!.click();
    await frames();
    expect(store.get().expandedTurnIds).toEqual(new Set(["c"]));
    expect(rowWith(viewport, "c-step-5")).toBeDefined();
    expect(pointed()?.textContent).toContain("Hide traces");
    expect(pointed()!.getBoundingClientRect().top).toBe(place.top);
    pointed()!.click();
    await frames();
    expect(store.get().expandedTurnIds.size).toBe(0);
    expect(pointed()?.textContent).toContain("View traces");
    expect(pointed()!.getBoundingClientRect().top).toBe(place.top);
});

it("folds from the top control without moving what is above it", async () => {
    const { view, store } = renderChat([...turn("a", 6), ...turn("b", 20), ...turn("c", 3)]);
    await view.ready();
    await frames();
    const viewport = viewportOf(view);
    store.turnTraceToggle("b");
    await frames();
    // Bring the top of the open turn into view, its prompt just inside the top edge.
    const offset =
        rowWith(viewport, "Prompt b:")!.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top -
        40;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: offset }));
    viewport.scrollTop += offset;
    await frames();
    const top = [...viewport.querySelectorAll<HTMLElement>("button")].find(
        (button) =>
            button.textContent?.includes("Hide traces") &&
            button.closest(".happy-message-list__virtual-row")?.textContent?.includes("b-step-0"),
    )!;
    expect(top).toBeDefined();
    const promptRow = rowWith(viewport, "Prompt b:")!;
    const promptTop = promptRow.getBoundingClientRect().top;
    expect(promptTop).toBeGreaterThanOrEqual(viewport.getBoundingClientRect().top);
    top.click();
    await frames();
    expect(store.get().expandedTurnIds.has("b")).toBe(false);
    expect(promptRow.isConnected).toBe(true);
    expect(promptRow.getBoundingClientRect().top).toBe(promptTop);
});
