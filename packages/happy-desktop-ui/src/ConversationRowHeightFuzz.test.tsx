import { useState } from "react";
import { flushSync } from "react-dom";
import type { ComposerSnapshot, ConversationAuthor, ConversationEntry } from "happy-desktop-state";
import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import { createRenderer } from "./testing";
import { markdownReplyGenerate } from "./testing/markdownReplyFuzz";

/* Differential check of the transcript's row-height model against the browser.
 * Transcript rows are placed from heights the model predicts, never measured,
 * so a reply the model makes a line short draws the next row over its last
 * line, and one it makes a line long leaves a gap. Random Markdown replies at
 * random widths find the text the model still breaks differently.
 *
 * CI runs the fixed seeds below. Run many more locally:
 *   VITE_HAPPY_ROW_FUZZ_SEED=1000 VITE_HAPPY_ROW_FUZZ_SEEDS=200 \
 *     pnpm exec vitest run src/ConversationRowHeightFuzz.test.tsx --project chromium
 * Each seed is one reply laid out at several widths; a failure names the seed
 * and width, and `VITE_HAPPY_ROW_FUZZ_SEED=<seed> VITE_HAPPY_ROW_FUZZ_SEEDS=1`
 * replays it. */
const env = import.meta.env as Record<string, string | undefined>;
const FIRST_SEED = Number(env.VITE_HAPPY_ROW_FUZZ_SEED ?? 1);
const SEEDS = Number(env.VITE_HAPPY_ROW_FUZZ_SEEDS ?? 120);
/** Chromium lays rows out in whole LayoutUnits; a missed line is 20px or more. */
const TOLERANCE = 1;
/* A row the model makes short is the overlap this guards, and none may be.
   One it makes a line long only leaves a gap: Canvas measures text in a
   fallback font, as CJK, Hangul and emoji are, up to a pixel a line wider than
   layout does, which can cost a line: seeds 1-500 give 9 of 3,000. */
const LONG_BUDGET = 0.02;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const agent: ConversationAuthor = {
    id: "row-fuzz-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const composer: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "row-fuzz",
    submission: { status: "idle" },
    text: "",
};
function entries(seed: number, text: string): readonly ConversationEntry[] {
    return [
        {
            kind: "agentActivity",
            id: `tool-${String(seed)}`,
            sequence: "1",
            activity: {
                kind: "labeled",
                label: "Bash",
                subject: "Run",
                status: "success",
                mono: true,
            },
        },
        {
            kind: "message",
            source: "server",
            delivery: "sent",
            message: {
                id: `reply-${String(seed)}`,
                chatId: "row-fuzz",
                sequence: "2",
                changePts: "2",
                sender: agent,
                text,
                attachments: [],
                reactions: [],
                createdAt: "2026-10-25T23:04:00.000Z",
                generationStatus: "complete",
            },
        },
        {
            kind: "turnStatus",
            id: `status-${String(seed)}`,
            sequence: "3",
            status: "complete",
            reason: "completed",
            durationMs: 92_000,
            copyText: text,
        },
    ];
}

it.runIf(server.browser === "chromium")(
    "predicts the painted height of random Markdown replies at random widths",
    async () => {
        const view = createRenderer();
        let update!: (state: { seed: number; text: string; width: number }) => void;
        function Harness() {
            const [state, setState] = useState({ seed: 0, text: "Ready", width: 800 });
            update = setState;
            return (
                <div style={{ width: state.width, height: 4000 }}>
                    <ConversationView
                        agentAuthor={agent}
                        dock={
                            <ConversationDock
                                composer={composer}
                                onComposerSend={() => {}}
                                onComposerValueChange={() => {}}
                            />
                        }
                        conversationId={`row-fuzz-${String(state.seed)}`}
                        entries={entries(state.seed, state.text)}
                        motion="calm"
                    />
                </div>
            );
        }
        view.render(Harness, { width: 1000, height: 4000 });
        await view.ready();
        await document.fonts.ready;
        await nextFrame();

        const short: string[] = [];
        const long: string[] = [];
        let checks = 0;
        for (let seed = FIRST_SEED; seed < FIRST_SEED + SEEDS; seed += 1) {
            const { text, widths } = markdownReplyGenerate(seed);
            for (const width of widths) {
                flushSync(() => update({ seed, text, width }));
                await nextFrame();
                const reply = view.container.querySelector<HTMLElement>(
                    '.happy-message-list__virtual-row:has([data-generation-status="complete"])',
                );
                const footerRow = view.container
                    .querySelector('[data-happy-desktop-ui="turn-summary"]')
                    ?.closest<HTMLElement>(".happy-message-list__virtual-row");
                /* A reply taller than the 4000px scrollport leaves its footer
                   unmounted; such replies are not what this generates. */
                if (!reply || !footerRow) throw new Error(`seed ${String(seed)}: rows missing`);
                const body = reply.querySelector<HTMLElement>(".happy-message__body")!;
                const painted = reply.getBoundingClientRect().height;
                const reserved =
                    footerRow.getBoundingClientRect().top - reply.getBoundingClientRect().top;
                const overlap =
                    footerRow.getBoundingClientRect().top < body.getBoundingClientRect().bottom;
                checks += 1;
                const label = `seed ${String(seed)} at ${String(width)}px: painted ${painted.toFixed(2)}px, reserved ${reserved.toFixed(2)}px`;
                if (overlap || painted - reserved > TOLERANCE) short.push(label);
                else if (reserved - painted > TOLERANCE) long.push(label);
            }
        }
        console.info(
            `row-height fuzz: ${String(checks)} checks over seeds ${String(FIRST_SEED)}-${String(FIRST_SEED + SEEDS - 1)}; ` +
                `${String(short.length)} short (footer overlaps the reply), ${String(long.length)} long (gap)\n` +
                [
                    ...short.map((line) => `short ${line}`),
                    ...long.map((line) => `long ${line}`),
                ].join("\n"),
        );
        expect(short).toEqual([]);
        expect(long.length).toBeLessThanOrEqual(Math.ceil(checks * LONG_BUDGET));
    },
    600_000,
);
