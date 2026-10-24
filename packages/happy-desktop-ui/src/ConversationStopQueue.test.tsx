import { useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    happyAgentChatStoreCreate,
    happyAgentConversationProject,
    type ChatElement,
    type ComposerSnapshot,
    type HappyAgentSessionId,
    type SessionState,
} from "happy-desktop-state";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import { createRenderer } from "./testing";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function frames() {
    await frame();
    await frame();
}
const catalog = {
    defaultModelId: "model",
    defaultProviderId: "provider",
    models: [],
    providers: [],
};
const composer: ComposerSnapshot = {
    scopeId: "stop-queue",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
const question = {
    requestId: "stop-question",
    questions: [
        {
            id: "choice",
            header: "Continue",
            question: "Keep the current plan?",
            multiSelect: false,
            required: true,
            options: [{ label: "Keep", description: "Preserve the current plan" }],
        },
    ],
};
function session(running: boolean, docked: boolean): SessionState {
    return {
        activity: running
            ? { kind: "generating_message", label: "Working", since: 0 }
            : { kind: "idle", label: "Idle", since: 0 },
        status: running ? "running" : "idle",
        archived: false,
        sessionId: "stop-queue",
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
        pendingUserInputs: docked ? [question] : [],
        answeredUserInputs: [],
        pendingSteeringMessages: [],
        slashCommands: [],
        tasks: [],
        subagents: [],
        backgroundProcesses: [],
        connection: "live",
        transcriptComplete: true,
        loadingMore: false,
    };
}
function reply(id: string, paragraphs: number, groupId = "current"): ChatElement {
    return {
        id,
        messageId: id,
        groupId,
        runId: groupId,
        createdAt: 1000,
        kind: "agent_text",
        complete: false,
        text:
            `${id} ` +
            Array.from(
                { length: paragraphs },
                (_, index) => `Paragraph ${index}. ${"A stable reply stays in view. ".repeat(4)}`,
            ).join("\n\n"),
    };
}
function aborted(groupId: string): ChatElement {
    return {
        id: `${groupId}:end`,
        groupId,
        runId: groupId,
        createdAt: 2000,
        kind: "group_end",
        outcome: "stopped",
        reason: "abort",
        startedAt: 1000,
        endedAt: 2000,
        elapsedMs: 1000,
        turnStartedAt: 1000,
        turnElapsedMs: 1000,
        modelTurn: true,
    };
}
const cases = [0, 1, 3].flatMap((count) =>
    (count === 0 ? [false] : [false, true]).flatMap((large) =>
        [false, true].flatMap((parked) =>
            [false, true].map((held) => ({ count, large, parked, held, docked: held })),
        ),
    ),
);

it.each(["running", "delivery", "working between queued rows"] as const)(
    "preserves queued DOM identity when only %s changes",
    async (transition) => {
        const view = createRenderer();
        let running = true;
        let elements: readonly ChatElement[] = [
            ...Array.from({ length: 45 }, (_, index) => ({
                ...reply(`history:${index}`, 2, `history:${index}`),
                complete: true,
            })),
            ...Array.from(
                { length: 3 },
                (_, index): ChatElement => ({
                    id: `queued:${index}`,
                    messageId: `queued:${index}`,
                    groupId: `queued:${index}`,
                    runId: `queued:${index}`,
                    createdAt: 1500,
                    kind: "user_message",
                    authority: "local",
                    identity: null,
                    delivery: "pending_steering",
                    text: `Queued instruction ${index}`,
                }),
            ),
        ];
        let render!: () => void;
        function Harness() {
            const [, update] = useState(0);
            render = () => flushSync(() => update((value) => value + 1));
            return (
                <div style={{ height: 700, width: 880 }}>
                    <ConversationView
                        conversationId="stop-queue"
                        entries={happyAgentConversationProject({
                            elements,
                            sessionId: "stop-queue",
                            showReasoning: false,
                            ephemeral: [],
                            pendingUserInputs: [],
                            sentMessageIds: new Set(["queued:0", "queued:1", "queued:2"]),
                            answeredUserInputs: [],
                            expandedGroupIds: new Set(),
                            subagents: [],
                        })}
                        agentAuthor={agentAuthor}
                        viewerId={happyAgentOwnerAuthor.id}
                        running={running}
                        motion="calm"
                    />
                </div>
            );
        }
        view.render(Harness, { width: 1550, height: 1550 });
        try {
            await view.ready();
            await frames();
            const queuedNodes = () =>
                [...view.container.querySelectorAll<HTMLElement>(".happy-message")].filter((node) =>
                    node.textContent?.includes("Queued instruction"),
                );
            const original = queuedNodes();
            expect(original).toHaveLength(3);
            const checkIdentity = () => {
                const current = queuedNodes();
                expect(current).toHaveLength(original.length);
                for (const [index, node] of original.entries()) {
                    expect(current[index]).toBe(node);
                    expect(node.isConnected).toBe(true);
                }
            };
            const check = async () => {
                render();
                checkIdentity();
                await frames();
                checkIdentity();
            };
            if (transition !== "running") {
                elements = elements.map((entry) =>
                    entry.id === "queued:0" && entry.kind === "user_message"
                        ? { ...entry, delivery: "sent", authority: "server" }
                        : entry,
                );
                await check();
            }
            if (transition !== "delivery") {
                running = false;
                await check();
                running = true;
                await check();
            }
        } finally {
            view.destroy();
        }
    },
);

it.each(
    (["direct", "store"] as const).flatMap((mode) =>
        cases.map((scenario) => ({ ...scenario, mode })),
    ),
)("holds the reader through Stop and automatic dequeue: %j", async (scenario) => {
    const { mode } = scenario;
    const { count, large, parked, held, docked } = scenario;
    const label = `${mode} ${JSON.stringify(scenario)}`;
    const view = createRenderer();
    let elements: readonly ChatElement[] = [
        ...Array.from({ length: 45 }, (_, index) => ({
            ...reply(`history:${index}`, 2, `history:${index}`),
            complete: true,
        })),
        reply("current-reply", 2),
    ];
    let running = true;
    let showQuestion = false;
    let draft = "";
    let render!: () => void;
    let publishStore!: () => void;
    let stopped = 0;
    let sent = 0;
    const store = happyAgentChatStoreCreate("stop-queue" as HappyAgentSessionId, {
        catalog,
        transcriptConnect: (options) => {
            publishStore = () => options.onChange(elements, session(running, showQuestion), []);
            return { close: () => undefined, loadMore: () => undefined };
        },
        connectActions: {
            sendMessage: () => `queued:${sent++}`,
            stopRun: () => {
                stopped += 1;
                return `stop:${stopped}`;
            },
        } as never,
        connectMutationSubscribe: () => () => undefined,
    });
    const queued: ChatElement[] = Array.from({ length: count }, (_, index) => ({
        id: `queued:${index}`,
        messageId: `queued:${index}`,
        groupId: `queued:${index}`,
        runId: `queued:${index}`,
        createdAt: 1500,
        kind: "user_message",
        authority: "local",
        identity: null,
        delivery: "pending_steering",
        text:
            `Queued instruction ${index}. ` +
            (large ? "A very large queued instruction.\n\n".repeat(90) : "Do the next task."),
    }));
    const stop = () => {
        if (mode === "store") void store.runAbort();
        else stopped += 1;
    };
    function Harness() {
        const [, update] = useState(0);
        const snapshot = useSyncExternalStore(store.subscribe, store.get);
        render = () =>
            flushSync(() => {
                publishStore();
                update((value) => value + 1);
            });
        const entries =
            mode === "store"
                ? snapshot.entries
                : happyAgentConversationProject({
                      elements,
                      sessionId: "stop-queue",
                      showReasoning: false,
                      ephemeral: [],
                      pendingUserInputs: showQuestion ? [question] : [],
                      sentMessageIds: new Set(queued.map((entry) => entry.id)),
                      answeredUserInputs: [],
                      expandedGroupIds: new Set(),
                      subagents: [],
                  });
        return (
            <div style={{ height: 700, width: 880 }}>
                <ConversationView
                    conversationId="stop-queue"
                    entries={entries}
                    agentAuthor={agentAuthor}
                    viewerId={happyAgentOwnerAuthor.id}
                    running={running}
                    motion="calm"
                    onTracesSeen={mode === "store" ? store.turnTracesSeen : undefined}
                    dock={
                        <ConversationDock
                            composer={{ ...composer, text: draft }}
                            running={running}
                            onAbort={stop}
                            onComposerValueChange={() => undefined}
                            onComposerSend={() => undefined}
                        />
                    }
                />
            </div>
        );
    }
    view.render(Harness, { width: 1550, height: 1550 });
    try {
        render();
        await view.ready();
        await frames();
        if (held) {
            draft = "Draft line\n".repeat(3);
            render();
            if (mode === "store")
                for (const entry of queued)
                    if (entry.kind === "user_message") await store.messageSend(entry.text);
            showQuestion = docked;
            render();
            await frames();
            draft = "";
            render();
            await frames();
        }
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        if (parked) {
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -300, cancelable: true }));
            viewport.scrollTop -= 300;
            await frames();
        }
        const bounds = () => viewport.getBoundingClientRect();
        const painted = () =>
            [...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")].filter(
                (row) => {
                    const rect = row.getBoundingClientRect();
                    return (
                        rect.height > 0 && rect.bottom > bounds().top && rect.top < bounds().bottom
                    );
                },
            );
        const anchor = painted().find((row) => row.dataset.itemId !== "working-status")!;
        const anchorTop = anchor.getBoundingClientRect().top;
        function checkRowGeometry(name: string) {
            for (const row of painted()) {
                const next = row.nextElementSibling;
                if (
                    !(next instanceof HTMLElement) ||
                    Number(next.dataset.index) !== Number(row.dataset.index) + 1
                )
                    continue;
                const rect = row.getBoundingClientRect();
                const modeled = next.getBoundingClientRect().top - rect.top;
                expect(
                    Math.abs(modeled - rect.height),
                    `${label}: ${name} row ${row.dataset.index} modeled ${modeled}, painted ${rect.height}`,
                ).toBeLessThanOrEqual(1);
            }
        }
        function checkFollowingEnd(name: string) {
            if (parked) return;
            const last = [...elements]
                .reverse()
                .find((entry) => entry.kind === "agent_text" || entry.kind === "user_message");
            if (last?.kind !== "agent_text" && last?.kind !== "user_message")
                throw new Error("Missing last message");
            const needle = last.text.split("\n")[0]!.slice(0, 40);
            const message = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].find(
                (node) => node.querySelector(".happy-message__body")?.textContent?.includes(needle),
            );
            expect(message, `${label}: ${name} newest message not mounted`).toBeDefined();
            const rect = message!.getBoundingClientRect();
            expect(rect.bottom, `${label}: ${name} newest message below fold`).toBeLessThanOrEqual(
                bounds().bottom + 1,
            );
            expect(rect.bottom, `${label}: ${name} newest message above viewport`).toBeGreaterThan(
                bounds().top,
            );
        }
        async function step(name: string, change: () => void) {
            const before = [...viewport.querySelectorAll<HTMLElement>(".happy-message")]
                .filter((node) => {
                    const rect = node.getBoundingClientRect();
                    return rect.bottom > bounds().top && rect.top < bounds().bottom;
                })
                .map((node) => ({
                    node,
                    text: node.querySelector(".happy-message__body")?.textContent,
                    top: node.getBoundingClientRect().top,
                }));
            change();
            render();
            await frame();
            expect(painted().length, `${label}: ${name} blank first frame`).toBeGreaterThan(0);
            checkRowGeometry(`${name} first frame`);
            checkFollowingEnd(`${name} first frame`);
            if (parked) {
                expect(anchor.isConnected, `${label}: ${name} parked anchor unmounted`).toBe(true);
                expect(
                    Math.abs(anchor.getBoundingClientRect().top - anchorTop),
                    `${label}: ${name} parked anchor shifted`,
                ).toBeLessThanOrEqual(1);
            } else
                for (const previous of before) {
                    const current = [
                        ...viewport.querySelectorAll<HTMLElement>(".happy-message"),
                    ].find(
                        (node) =>
                            node.querySelector(".happy-message__body")?.textContent ===
                            previous.text,
                    );
                    if (!current || current.getBoundingClientRect().bottom <= bounds().top)
                        continue;
                    expect(
                        current.getBoundingClientRect().top,
                        `${label}: ${name} visible content jumped down`,
                    ).toBeLessThanOrEqual(previous.top + 1);
                    expect(current, `${label}: ${name} visible message remounted`).toBe(
                        previous.node,
                    );
                }
            await frames();
            expect(painted().length, `${label}: ${name} blank after settling`).toBeGreaterThan(0);
            checkRowGeometry(`${name} settled`);
            checkFollowingEnd(`${name} settled`);
        }
        await step("queue", () => {
            elements = [...elements, ...queued];
        });
        const stopButton = view.container.querySelector<HTMLButtonElement>("[data-action=stop]")!;
        expect(stopButton, label).toBeDefined();
        stopButton.click();
        expect(stopped, label).toBe(1);
        await step("aborted turn", () => {
            running = false;
            elements = elements.filter((entry) => entry.kind !== "user_message");
            elements = [
                ...elements.map((entry) =>
                    entry.kind === "agent_text" ? { ...entry, complete: true } : entry,
                ),
                aborted("current"),
                ...queued,
            ];
        });
        if (count > 0) {
            await step("dequeue accepted", () => {
                elements = elements.map((entry) =>
                    entry.kind === "user_message"
                        ? {
                              ...entry,
                              delivery: "sent",
                              authority: "server",
                              groupId: "dequeued",
                              runId: "dequeued",
                          }
                        : entry,
                );
            });
            await step("dequeued turn starts", () => {
                running = true;
                elements = [...elements, reply("dequeued-reply", 1, "dequeued")];
            });
            for (const paragraphs of [2, 5, 10])
                await step(`stream ${paragraphs}`, () => {
                    elements = elements.map((entry) =>
                        entry.id === "dequeued-reply"
                            ? reply("dequeued-reply", paragraphs, "dequeued")
                            : entry,
                    );
                });
            view.container.querySelector<HTMLButtonElement>("[data-action=stop]")!.click();
            expect(stopped, label).toBe(2);
            await step("stop dequeued turn", () => {
                running = false;
                elements = [...elements, aborted("dequeued")];
            });
        }
    } finally {
        view.destroy();
        store[Symbol.dispose]();
    }
});
