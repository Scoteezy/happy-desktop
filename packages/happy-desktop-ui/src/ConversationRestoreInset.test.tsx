import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { agentAuthor, type ConversationEntry } from "happy-desktop-state";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import type { MessageListScrollPosition } from "./Message";
import { createRenderer } from "./testing";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function frames() {
    await frame();
    await frame();
}
const entries: ConversationEntry[] = Array.from({ length: 65 }, (_, index) => ({
    kind: "message",
    source: "server",
    delivery: "sent",
    message: {
        id: `restore:${index}`,
        chatId: "restore-inset",
        sequence: String(index),
        changePts: String(index),
        sender: agentAuthor,
        text: `History ${index}. ${"A stable paragraph stays where the reader left it. ".repeat(2 + (index % 5))}`,
        attachments: [],
        reactions: [],
        createdAt: "2026-10-23T13:27:00.000Z",
    },
}));

it("restores the tail's actual inset when the parked point falls in the status footer", async () => {
    const view = createRenderer();
    let saved: MessageListScrollPosition | undefined;
    let remount!: () => void;
    function Harness() {
        const [shown, setShown] = useState<{
            generation: number;
            position?: MessageListScrollPosition;
        }>({ generation: 0 });
        remount = () =>
            flushSync(() => setShown({ generation: shown.generation + 1, position: saved }));
        return (
            <div style={{ width: 820, height: 650 }}>
                <ConversationView
                    key={shown.generation}
                    conversationId="restore-inset"
                    agentAuthor={agentAuthor}
                    entries={entries}
                    motion="calm"
                    running
                    scrollPosition={shown.position}
                    onScrollPositionChange={(position) => {
                        saved = position;
                    }}
                />
            </div>
        );
    }
    view.render(Harness, { height: 1550, width: 1550 });
    try {
        await view.ready();
        await frames();
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -4, cancelable: true }));
        viewport.scrollTop -= 4;
        await frames();
        expect(saved?.type).toBe("row");
        const tail = [...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")]
            .filter((node) => node.dataset.itemId !== "working-status")
            .at(-1)!;
        const text = tail.textContent;
        const top = tail.getBoundingClientRect().top;
        const bounds = viewport.getBoundingClientRect();
        expect(
            tail.getBoundingClientRect().bottom,
            "fixture must hold the tail above the standard reading point",
        ).toBeLessThan(bounds.bottom - 32);
        const position = saved;
        remount();
        await frame();
        const restored = [
            ...view.container.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
        ].find((node) => node.textContent === text)!;
        expect(restored, "restored tail missing in first frame").toBeDefined();
        expect(
            Math.abs(restored.getBoundingClientRect().top - top),
            `tail moved ${restored.getBoundingClientRect().top - top}px restoring ${JSON.stringify(position)}`,
        ).toBeLessThanOrEqual(1);
        const first = restored.getBoundingClientRect().top;
        await frames();
        expect(restored.getBoundingClientRect().top).toBe(first);
    } finally {
        view.destroy();
    }
});
