import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type { ComposerSnapshot, ConversationAuthor, ConversationEntry } from "happy-desktop-state";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import { createRenderer } from "./testing";

const reader: ConversationAuthor = {
    id: "send-reader",
    displayName: "You",
    username: "you",
    kind: "human",
};
const agent: ConversationAuthor = {
    id: "send-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const composer: ComposerSnapshot = {
    scopeId: "send-stability",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
function message(id: string, text: string, own = false, sentHere = false): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        ...(sentHere ? { sentHere: true } : {}),
        message: {
            id,
            chatId: "send-stability",
            sequence: id,
            changePts: id,
            sender: own ? reader : agent,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-23T13:27:00.000Z",
        },
    };
}
const frames = async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};
function renderConversation(count: number, withShell = false) {
    const view = createRenderer();
    let send!: () => void;
    let resize!: (height: number) => void;
    let question!: (answered: boolean) => void;
    let stream!: (lines: number) => void;
    let finish!: () => void;
    function Dock() {
        const [text, setText] = useState("");
        return (
            <ConversationDock
                composer={{ ...composer, text }}
                composerPlaceholder="Message Happy…"
                onComposerSend={() => undefined}
                onComposerValueChange={setText}
            />
        );
    }
    function Harness() {
        const [entries, setEntries] = useState<readonly ConversationEntry[]>(() => {
            const history = Array.from({ length: count }, (_, index) =>
                message(
                    `history-${String(index)}`,
                    `History ${String(index)}. ${"A completed reply stays in its place. ".repeat(count > 100 ? 1 + (index % 13) * 3 : 8)}`,
                    index % 2 === 0,
                ),
            );
            if (withShell)
                history.splice(Math.max(0, history.length - 2), 0, {
                    kind: "agentActivity",
                    id: "large-shell",
                    sequence: "large-shell",
                    activity: {
                        kind: "shell",
                        command: "cat build.log",
                        output: Array.from(
                            { length: 100 },
                            (_, index) => `Build output ${String(index)}`,
                        ).join("\n"),
                        exitCode: 0,
                        running: false,
                        timedOut: false,
                    },
                });
            return history;
        });
        const [height, setHeight] = useState(700);
        const [running, setRunning] = useState(false);
        finish = () => flushSync(() => setRunning(false));
        send = () =>
            flushSync(() =>
                setEntries((previous) => [
                    ...previous,
                    message("sent-message", "The newly sent message", true, true),
                ]),
            );
        resize = (next) => flushSync(() => setHeight(next));
        stream = (lines) =>
            flushSync(() =>
                setEntries((previous) => {
                    const entry = message(
                        "streaming-reply",
                        Array.from(
                            { length: lines },
                            (_, index) =>
                                `Streaming paragraph ${String(index)}. ${"A stable sentence. ".repeat(6)}`,
                        ).join("\n\n"),
                    );
                    return previous.some(
                        (item) => item.kind === "message" && item.message.id === "streaming-reply",
                    )
                        ? previous.map((item) =>
                              item.kind === "message" && item.message.id === "streaming-reply"
                                  ? entry
                                  : item,
                          )
                        : [...previous, entry];
                }),
            );
        question = (answered) =>
            flushSync(() => {
                const entry: ConversationEntry = {
                    kind: "request",
                    id: "geometry-question",
                    sequence: "geometry-question",
                    request: {
                        kind: "userInput",
                        requestId: "geometry-question",
                        ...(answered
                            ? { status: "answered" as const, answers: { choice: ["Keep"] } }
                            : { status: "pending" as const }),
                        questions: [
                            {
                                id: "choice",
                                header: "Layout",
                                question: "Keep this layout?",
                                multiSelect: false,
                                required: true,
                                options: [
                                    { label: "Keep", description: "Preserve the layout" },
                                    { label: "Change", description: "Update the layout" },
                                ],
                            },
                        ],
                    },
                };
                setEntries((previous) =>
                    previous.some((item) => item.kind === "request")
                        ? previous.map((item) => (item.kind === "request" ? entry : item))
                        : [...previous, entry],
                );
                setRunning(answered);
            });
        return (
            <div style={{ height, width: 880 }}>
                <ConversationView
                    agentAuthor={agent}
                    conversationId={`send-stability-${String(count)}`}
                    dock={<Dock />}
                    entries={entries}
                    motion="calm"
                    running={running}
                    viewerId={reader.id}
                />
            </div>
        );
    }
    view.render(Harness, { height: 900, width: 1000 });
    return {
        view,
        send: () => send(),
        resize: (height: number) => resize(height),
        question: (answered: boolean) => question(answered),
        stream: (lines: number) => stream(lines),
        finish: () => finish(),
    };
}

it.each([0, 40])("keeps a send at the natural bottom with %i preceding messages", async (count) => {
    const { view, send } = renderConversation(count);
    await view.ready();
    await frames();
    send();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    const textarea = view.container.querySelector<HTMLTextAreaElement>("textarea")!;
    const row = [...view.container.querySelectorAll<HTMLElement>(".happy-message")].find(
        (element) => element.textContent?.includes("The newly sent message"),
    )!;
    const bounds = viewport.getBoundingClientRect();
    const sent = row.getBoundingClientRect();
    expect(sent.top).toBeGreaterThan(bounds.top + bounds.height / 2);
    expect(bounds.bottom - sent.bottom).toBe(24);
    expect(view.container.querySelector(".happy-message-list__tail")).toBeNull();
    const top = viewport.scrollTop;
    await userEvent.click(textarea);
    for (let index = 0; index < 3; index += 1) {
        await userEvent.keyboard("x");
        await userEvent.keyboard("{Backspace}");
        await frames();
        expect(row.getBoundingClientRect().top).toBe(sent.top);
        expect(viewport.scrollTop).toBe(top);
        expect(view.container.querySelector("textarea")).toBe(textarea);
        expect(document.activeElement).toBe(textarea);
    }
});

it("leaves a parked reader in place through a send and viewport height changes", async () => {
    const { view, send, resize } = renderConversation(60);
    await view.ready();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -240 }));
    viewport.scrollTop -= 240;
    await frames();
    const viewportBounds = viewport.getBoundingClientRect();
    const anchor = [
        ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
    ].find((row) => {
        const bounds = row.getBoundingClientRect();
        return bounds.top > viewportBounds.top && bounds.bottom < viewportBounds.bottom;
    })!;
    const top = anchor.getBoundingClientRect().top;
    send();
    await frames();
    expect(anchor.isConnected).toBe(true);
    expect(anchor.getBoundingClientRect().top).toBe(top);
    resize(800);
    await frames();
    expect(anchor.getBoundingClientRect().top).toBe(top);
    resize(700);
    await frames();
    expect(anchor.getBoundingClientRect().top).toBe(top);
    expect(view.container.querySelector(".happy-message-list__viewport")).toBe(viewport);
});

it("does not resume following on a small native offset adjustment after an upward wheel", async () => {
    const { view, send } = renderConversation(40);
    await view.ready();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -4 }));
    viewport.scrollTop -= 4;
    await frames();
    viewport.scrollTop += 1;
    const parked = viewport.scrollTop;
    await frames();
    expect(viewport.scrollTop).toBe(parked);
    send();
    await frames();
    expect(viewport.scrollTop).toBe(parked);
});

it.each([0.67, 0.9, 1.5, 2])(
    "never writes upward while following the fractional native bottom at zoom %f",
    async (zoom) => {
        const { view, send } = renderConversation(40);
        await view.ready();
        await frames();
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const panel =
            view.container.querySelector<HTMLElement>(".happy-conversation")!.parentElement!;
        panel.style.zoom = String(zoom);
        await frames();
        const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
        const upward: number[] = [];
        Object.defineProperty(viewport, "scrollTop", {
            configurable: true,
            get: () => descriptor.get!.call(viewport) as number,
            set: (value: number) => {
                const before = descriptor.get!.call(viewport) as number;
                descriptor.set!.call(viewport, value);
                const after = descriptor.get!.call(viewport) as number;
                if (after < before) upward.push(after - before);
            },
        });
        try {
            // Native scrolling retains a fractional maximum that the integer
            // scrollHeight/clientHeight calculation can undershoot.
            descriptor.set!.call(viewport, Number.MAX_SAFE_INTEGER);
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 20, cancelable: true }));
            await frames();
            send();
            await frames();
            expect(upward).toEqual([]);
        } finally {
            Reflect.deleteProperty(viewport, "scrollTop");
        }
    },
);

it.each([2, 40])(
    "keeps geometry slack fixed while it is visible with %i preceding messages",
    async (count) => {
        const { view, send, resize } = renderConversation(count);
        await view.ready();
        await frames();
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const content = viewport.querySelector<HTMLElement>(".happy-message-list__virtual")!;
        const anchor = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
        const top = anchor.getBoundingClientRect().top;
        resize(800);
        await frames();
        expect(anchor.getBoundingClientRect().top).toBe(top);
        const extent = content.style.minHeight;
        expect(Number.parseFloat(extent)).toBeGreaterThan(0);
        send();
        await frames();
        expect(anchor.getBoundingClientRect().top).toBe(top);
        expect(content.style.minHeight).toBe(extent);
        expect(viewport.querySelector(".happy-message-list__tail")).toBeNull();
    },
);

it.each([40, 640])(
    "keeps %i transcript rows fixed when a docked question becomes answered history",
    async (count) => {
        const { view, question } = renderConversation(count, count > 100);
        await view.ready();
        await frames();
        const anchor = [...view.container.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
        const top = anchor.getBoundingClientRect().top;
        question(false);
        await frames();
        expect(anchor.getBoundingClientRect().top).toBe(top);
        question(true);
        await frames();
        await new Promise<void>((resolve) => setTimeout(resolve, 1200));
        expect(anchor.isConnected).toBe(true);
        expect(anchor.getBoundingClientRect().top).toBe(top);
    },
);

it("keeps newer messages fixed when a question above them is answered", async () => {
    const { view, question, send, resize } = renderConversation(60);
    await view.ready();
    question(false);
    send();
    await frames();
    const anchor = [...view.container.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
    const top = anchor.getBoundingClientRect().top;
    question(true);
    await frames();
    expect(anchor.isConnected).toBe(true);
    expect(Math.abs(anchor.getBoundingClientRect().top - top)).toBeLessThan(1);
    const textarea = view.container.querySelector<HTMLTextAreaElement>("textarea")!;
    await userEvent.click(textarea);
    await userEvent.keyboard("one{Shift>}{Enter}{/Shift}two{Shift>}{Enter}{/Shift}three");
    await frames();
    const expandedTop = anchor.getBoundingClientRect().top;
    resize(800);
    await frames();
    expect(Math.abs(anchor.getBoundingClientRect().top - expandedTop)).toBeLessThan(1);
    await userEvent.keyboard("{Meta>}a{/Meta}{Backspace}");
    await frames();
    expect(Math.abs(anchor.getBoundingClientRect().top - expandedTop)).toBeLessThan(1);
});

it("keeps a cold long history fixed while resize slack and idle refinement overlap", async () => {
    const { view, resize } = renderConversation(400);
    await view.ready();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    const anchor = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
    const top = anchor.getBoundingClientRect().top;
    resize(800);
    await frames();
    expect(anchor.getBoundingClientRect().top).toBe(top);
    await new Promise<void>((resolve) => setTimeout(resolve, 1200));
    expect(anchor.isConnected).toBe(true);
    expect(anchor.getBoundingClientRect().top).toBe(top);
    expect(viewport.getBoundingClientRect().bottom - anchor.getBoundingClientRect().bottom).toBe(
        124,
    );
});

it("keeps a parked row fixed when answering grows the viewport", async () => {
    const { view, question, send } = renderConversation(60);
    await view.ready();
    question(false);
    send();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -200 }));
    viewport.scrollTop -= 200;
    await frames();
    const bounds = viewport.getBoundingClientRect();
    const anchor = [
        ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
    ].find((row) => {
        const rect = row.getBoundingClientRect();
        return rect.top <= bounds.bottom - 60 && rect.bottom > bounds.bottom - 60;
    })!;
    const top = anchor.getBoundingClientRect().top;
    question(true);
    await frames();
    expect(anchor.isConnected).toBe(true);
    expect(Math.abs(anchor.getBoundingClientRect().top - top)).toBeLessThan(1);
});

it("anchors the last visible message when an upward wheel lands in preserved blank space", async () => {
    const { view, question, send, resize } = renderConversation(60);
    await view.ready();
    question(false);
    send();
    await frames();
    resize(1000);
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -4 }));
    viewport.scrollTop -= 4;
    await frames();
    const anchor = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
    const top = anchor.getBoundingClientRect().top;
    question(true);
    await frames();
    expect(anchor.isConnected).toBe(true);
    expect(Math.abs(anchor.getBoundingClientRect().top - top)).toBeLessThan(1);
});

it("keeps a parked message fixed when the status footer disappears near the bottom", async () => {
    const { view, question, finish } = renderConversation(60);
    await view.ready();
    question(true);
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -4 }));
    viewport.scrollTop -= 4;
    await frames();
    const anchor = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
    const top = anchor.getBoundingClientRect().top;
    finish();
    await frames();
    expect(anchor.isConnected).toBe(true);
    expect(Math.abs(anchor.getBoundingClientRect().top - top)).toBeLessThan(1);
});

it("keeps the visible parked row fixed when resize clips its previous anchor and streaming resumes", async () => {
    const { view, stream, send, resize } = renderConversation(60);
    await view.ready();
    const panel = view.container.querySelector<HTMLElement>(".happy-conversation")!.parentElement!;
    panel.style.width = "360px";
    stream(30);
    await frames();
    send();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -40 }));
    viewport.scrollTop -= 40;
    await frames();
    panel.style.width = "880px";
    resize(350);
    await frames();
    const bounds = viewport.getBoundingClientRect();
    const anchor = [...viewport.querySelectorAll<HTMLElement>(".happy-message")]
        .filter((row) => {
            const rect = row.getBoundingClientRect();
            return rect.top < bounds.bottom && rect.bottom > bounds.top;
        })
        .at(-1)!;
    const top = anchor.getBoundingClientRect().top;
    stream(31);
    await frames();
    expect(anchor.isConnected).toBe(true);
    expect(anchor.getBoundingClientRect().top).toBe(top);
});

it("keeps a parked text anchor and its DOM node through cold-history refinement while typing", async () => {
    const { view, resize, send } = renderConversation(401, true);
    await view.ready();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -220 }));
    // A server append may commit before the wheel's native scroll event.
    send();
    viewport.scrollTop -= 220;
    await frames();
    const bounds = viewport.getBoundingClientRect();
    const anchor = [
        ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
    ].find((row) => {
        const rect = row.getBoundingClientRect();
        return rect.top <= bounds.bottom - 70 && rect.bottom > bounds.bottom - 70;
    })!;
    const top = anchor.getBoundingClientRect().top;
    const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    while (text && !text.textContent?.trim()) text = walker.nextNode();
    const range = document.createRange();
    range.setStart(text!, 0);
    range.setEnd(text!, 1);
    const textTop = range.getBoundingClientRect().top;
    resize(800);
    await frames();
    const textarea = view.container.querySelector<HTMLTextAreaElement>("textarea")!;
    let removed = false;
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations)
            for (const node of mutation.removedNodes)
                if (node === anchor || node.contains(anchor)) removed = true;
    });
    observer.observe(viewport, { childList: true, subtree: true });
    // Keep TanStack's real scroll listener active while idle sizes publish.
    // Any synchronous range render must retain the exact visible DOM node.
    const scrolling = setInterval(() => viewport.dispatchEvent(new Event("scroll")), 30);
    await userEvent.click(textarea);
    await userEvent.keyboard("x{Backspace}");
    await new Promise<void>((resolve) => setTimeout(resolve, 1200));
    clearInterval(scrolling);
    observer.disconnect();
    expect(removed).toBe(false);
    expect(anchor.isConnected).toBe(true);
    expect(anchor.getBoundingClientRect().top).toBe(top);
    expect(range.startContainer.isConnected).toBe(true);
    expect(range.getBoundingClientRect().top).toBe(textTop);
    expect(document.activeElement).toBe(textarea);
});

it.each([2, 40])(
    "keeps visible rows fixed while a multiline composer grows and clears with %i messages",
    async (count) => {
        const { view } = renderConversation(count);
        await view.ready();
        await frames();
        const textarea = view.container.querySelector<HTMLTextAreaElement>("textarea")!;
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const anchor = [...view.container.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
        const anchorTop = () =>
            anchor.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
        const top = anchorTop();
        await userEvent.click(textarea);
        await userEvent.keyboard("one{Shift>}{Enter}{/Shift}two{Shift>}{Enter}{/Shift}three");
        await frames();
        expect(textarea.value).toBe("one\ntwo\nthree");
        expect(anchorTop()).toBe(top);
        await userEvent.keyboard("{Meta>}a{/Meta}{Backspace}");
        await frames();
        expect(textarea.value).toBe("");
        expect(anchorTop()).toBe(top);
    },
);
