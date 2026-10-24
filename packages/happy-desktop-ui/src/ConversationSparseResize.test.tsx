import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { agentAuthor, type ComposerSnapshot, type ConversationEntry } from "happy-desktop-state";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import { createRenderer } from "./testing";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function frames() {
    await frame();
    await frame();
}
const composer: ComposerSnapshot = {
    scopeId: "sparse-resize",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
const entries: ConversationEntry[] = [
    {
        kind: "notice",
        id: "retry",
        sequence: "retry",
        variant: "notice",
        level: "warning",
        title: "Retrying",
        text: "Temporary provider failure",
        retry: { attempt: 2 },
    },
];

it("keeps a short retry notice visible when the parked viewport shrinks (seed 32749)", async () => {
    const view = createRenderer();
    let resize!: () => void;
    function Harness() {
        const [height, update] = useState(650);
        resize = () => flushSync(() => update(420));
        return (
            <div style={{ height, width: 820 }}>
                <ConversationView
                    conversationId="sparse-resize"
                    entries={entries}
                    agentAuthor={agentAuthor}
                    motion="calm"
                    running
                    dock={
                        <ConversationDock
                            composer={composer}
                            onComposerValueChange={() => undefined}
                            onComposerSend={() => undefined}
                        />
                    }
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
        viewport.dispatchEvent(
            new WheelEvent("wheel", { deltaY: -viewport.scrollHeight, cancelable: true }),
        );
        viewport.scrollTop = 0;
        await frames();
        resize();
        await frames();
        const bounds = viewport.getBoundingClientRect();
        const rows = [
            ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
        ];
        const visible = rows.filter((row) => {
            const rect = row.getBoundingClientRect();
            return rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom;
        });
        expect(
            visible.length,
            `no painted content after shrink: scrollTop=${viewport.scrollTop}; mounted=${rows.map((row) => `${row.dataset.index}@${row.getBoundingClientRect().top}`).join(",")}`,
        ).toBeGreaterThan(0);
    } finally {
        view.destroy();
    }
});
