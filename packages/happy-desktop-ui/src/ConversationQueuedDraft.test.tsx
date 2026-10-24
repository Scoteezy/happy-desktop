import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationEntry,
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
const composer: ComposerSnapshot = {
    scopeId: "queue-draft",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
function message(id: string, text: string, own = false): ConversationEntry {
    return {
        kind: "message",
        source: own ? "local" : "server",
        delivery: own ? "sending" : "sent",
        ...(own ? { sentHere: true } : {}),
        message: {
            id,
            chatId: "queue-draft",
            sequence: id,
            changePts: id,
            sender: own ? happyAgentOwnerAuthor : agentAuthor,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-23T13:27:00.000Z",
        },
    };
}
const history = Array.from({ length: 65 }, (_, index) =>
    message(
        `history:${index}`,
        `History ${index}. ${"A stable paragraph stays where the reader left it. ".repeat(2 + (index % 5))}`,
    ),
);

it.each([1, 3, 12])(
    "shows the newest of %i rapid sends when a multiline draft clears during a run (seed 42)",
    async (count) => {
        const view = createRenderer();
        let draft!: () => void;
        let stream!: (grow: boolean, complete: boolean) => void;
        let send!: () => void;
        function Harness() {
            const [entries, update] = useState<readonly ConversationEntry[]>(history);
            const [text, textUpdate] = useState("");
            draft = () => flushSync(() => textUpdate("Draft line\n".repeat(3)));
            stream = (grow, complete) =>
                flushSync(() => {
                    const entry = message(
                        "stream",
                        "Streaming stream" +
                            (grow ? "\n\nAnother streaming paragraph. ".repeat(3) : ""),
                    );
                    if (entry.kind !== "message") return;
                    const reply: ConversationEntry = {
                        ...entry,
                        message: {
                            ...entry.message,
                            generationStatus: complete ? "complete" : "streaming",
                        },
                    };
                    update((previous) =>
                        previous.some(
                            (item) => item.kind === "message" && item.message.id === "stream",
                        )
                            ? previous.map((item) =>
                                  item.kind === "message" && item.message.id === "stream"
                                      ? reply
                                      : item,
                              )
                            : [...previous, reply],
                    );
                });
            send = () =>
                flushSync(() => {
                    update((previous) => [
                        ...previous,
                        ...Array.from({ length: count }, (_, index) =>
                            message(`send:${index}`, `Sent ${index}`, true),
                        ),
                    ]);
                    textUpdate("");
                });
            return (
                <div style={{ height: 650, width: 820 }}>
                    <ConversationView
                        conversationId="queue-draft"
                        agentAuthor={agentAuthor}
                        viewerId={happyAgentOwnerAuthor.id}
                        entries={entries}
                        motion="calm"
                        running
                        dock={
                            <ConversationDock
                                composer={{ ...composer, text }}
                                onComposerValueChange={textUpdate}
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
            draft();
            await frames();
            stream(false, false);
            await frames();
            stream(true, false);
            await frames();
            stream(true, true);
            await frames();
            send();
            await frames();
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            const sent = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].find(
                (node) => node.textContent?.includes(`Sent ${count - 1}`),
            );
            expect(sent, "latest rapid send not mounted").toBeDefined();
            const bounds = viewport.getBoundingClientRect();
            expect(
                sent!.getBoundingClientRect().bottom,
                "latest send clipped below",
            ).toBeLessThanOrEqual(bounds.bottom + 1);
            expect(
                sent!.getBoundingClientRect().top,
                "latest send clipped above",
            ).toBeGreaterThanOrEqual(bounds.top - 1);
            const top = sent!.getBoundingClientRect().top;
            await frames();
            expect(sent!.isConnected, "latest send unmounted after settling").toBe(true);
            expect(Math.abs(sent!.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
        } finally {
            view.destroy();
        }
    },
);
