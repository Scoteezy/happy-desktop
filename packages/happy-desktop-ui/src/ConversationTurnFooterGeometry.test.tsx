import { useState } from "react";
import { flushSync } from "react-dom";
import type { ComposerSnapshot, ConversationAuthor, ConversationEntry } from "happy-desktop-state";
import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import { createRenderer } from "./testing";
import signInLinkList from "./fixtures/sign-in-link-list.txt?raw";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const agent: ConversationAuthor = {
    id: "turn-footer-agent",
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
    scopeId: "turn-footer",
    submission: { status: "idle" },
    text: "",
};
const tools: readonly ConversationEntry[] = [
    "Inspect provider config and Claude config dirs",
    "Read accounts recipe and redacted provider auth layout",
    "Start isolated Claude sign-in for the new account",
].map((subject, index) => ({
    kind: "agentActivity",
    id: `tool-${String(index)}`,
    sequence: String(index + 1),
    activity: { kind: "labeled", label: "Bash", subject, status: "success", mono: true },
}));
const entries: readonly ConversationEntry[] = [
    ...tools,
    {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id: "sign-in-reply",
            chatId: "turn-footer",
            sequence: "10",
            changePts: "10",
            sender: agent,
            text: signInLinkList,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-25T23:04:00.000Z",
            generationStatus: "complete",
        },
    },
    {
        kind: "turnStatus",
        id: "sign-in-status",
        sequence: "11",
        status: "complete",
        reason: "completed",
        durationMs: 92_000,
        copyText: signInLinkList,
    },
];

/* The reported overlap: a settled answer whose ordered list carries a long
   wrapping OAuth URL, closed by the "Completed in…" footer. Each transcript
   row is placed from its modeled height, so a modeled line short of what the
   browser paints draws the footer over the answer's last line.
   Chromium is the engine the app ships in. Gecko and WebKit still differ from
   the model at isolated widths for unrelated sub-pixel reasons (WebKit wraps
   the reserved hover time at 419.02px in a 419px column), as the other
   real-chat geometry checks acknowledge. */
it.runIf(server.browser === "chromium")(
    "keeps the turn footer below a reply with a long wrapping URL at every width",
    async () => {
        const view = createRenderer();
        let widthUpdate!: (width: number) => void;
        function Harness() {
            const [width, setWidth] = useState(1000);
            widthUpdate = setWidth;
            return (
                <div style={{ width, height: 1400 }}>
                    <ConversationView
                        agentAuthor={agent}
                        dock={
                            <ConversationDock
                                composer={composer}
                                onComposerSend={() => {}}
                                onComposerValueChange={() => {}}
                            />
                        }
                        conversationId="turn-footer"
                        entries={entries}
                        motion="calm"
                    />
                </div>
            );
        }
        view.render(Harness, { width: 1000, height: 1400 });
        await view.ready();
        await document.fonts.ready;
        await nextFrame();
        await nextFrame();
        const url = view.container.querySelector<HTMLElement>('a[href^="https://claude.com/"]')!;
        expect(url.getClientRects().length, "the URL wraps at the widest column").toBe(5);

        const failures: string[] = [];
        for (let width = 1000; width >= 320; width -= 1) {
            flushSync(() => widthUpdate(width));
            await nextFrame();
            const reply = view.container.querySelector<HTMLElement>(
                '.happy-message-list__virtual-row:has([data-generation-status="complete"])',
            )!;
            const footer = view.container.querySelector<HTMLElement>(
                '[data-happy-desktop-ui="turn-summary"]',
            )!;
            const paragraphs = reply.querySelectorAll("p");
            const lastLine = paragraphs[paragraphs.length - 1]!.getBoundingClientRect().bottom;
            const replyBounds = reply.getBoundingClientRect();
            const footerRow = footer.closest<HTMLElement>(".happy-message-list__virtual-row")!;
            const reserved = footerRow.getBoundingClientRect().top - replyBounds.top;
            const footerTop = footer.getBoundingClientRect().top;
            if (footerTop < lastLine || Math.abs(reserved - replyBounds.height) > 2.1)
                failures.push(
                    `${String(width)}px: painted ${replyBounds.height.toFixed(2)}px, reserved ${reserved.toFixed(2)}px, footer top ${footerTop.toFixed(2)} vs last line ${lastLine.toFixed(2)}`,
                );
        }
        expect(failures).toEqual([]);
    },
    120_000,
);
