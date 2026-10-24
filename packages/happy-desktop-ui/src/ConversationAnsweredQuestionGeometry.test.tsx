import { expect, it } from "vitest";
import { agentAuthor, type ConversationEntry } from "happy-desktop-state";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { createRenderer } from "./testing";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
it.each([false, true])(
    "matches narrow answered question height (options=%s, seed 999983)",
    async (options) => {
        const entry: ConversationEntry = {
            kind: "request",
            id: "question",
            sequence: "question",
            request: {
                kind: "userInput",
                requestId: "question",
                status: "answered",
                answers: { choice: ["Keep"] },
                questions: [
                    {
                        id: "choice",
                        header: "Layout",
                        question: "Keep this layout?",
                        multiSelect: false,
                        required: true,
                        options: options
                            ? [
                                  { label: "Keep", description: "Preserve the layout" },
                                  { label: "Change", description: "Use another layout" },
                              ]
                            : [],
                    },
                ],
            },
        };
        const view = createRenderer();
        view.render(
            () => (
                <div style={{ width: 180, height: 420 }}>
                    <ConversationView
                        conversationId="narrow-question"
                        entries={[entry]}
                        agentAuthor={agentAuthor}
                        running
                        motion="calm"
                    />
                </div>
            ),
            { width: 1550, height: 1550 },
        );
        try {
            await view.ready();
            await frame();
            await frame();
            const rows = [
                ...view.container.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
            ];
            const row = rows[0]!;
            const next = rows[1]!;
            expect(row).toBeDefined();
            expect(next).toBeDefined();
            const delta =
                Number.parseFloat(next.style.transform.slice("translateY(".length)) -
                Number.parseFloat(row.style.transform.slice("translateY(".length));
            expect(
                Math.abs(delta - row.getBoundingClientRect().height),
                `model=${delta}, paint=${row.getBoundingClientRect().height}`,
            ).toBeLessThanOrEqual(1);
        } finally {
            view.destroy();
        }
    },
);
