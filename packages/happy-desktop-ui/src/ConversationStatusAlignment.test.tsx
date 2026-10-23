import { expect, it } from "vitest";
import type {
    ConversationAuthor,
    ConversationEntry,
    ConversationFailure,
} from "happy-desktop-state";
import { ConversationEntryView } from "./ConversationEntryView";
import { conversationRowHeight } from "./conversationRowHeight";
import { createRenderer } from "./testing";
import "./styles.css";

const author: ConversationAuthor = {
    id: "happy",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const failure: ConversationFailure = {
    kind: "unknown",
    message: "Claude could not complete the request. Please switch accounts and try again.",
    resolution: {
        action: "switched",
        at: 1,
        providerId: "claude_kirill_for_sms_gmail",
        providerLabel: "Claude Kirill For Sms Gmail",
        modelId: "opus-5-5",
        modelName: "Opus 5.5",
    },
};
const entries: readonly ConversationEntry[] = [
    {
        kind: "notice",
        variant: "notice",
        id: "failure",
        sequence: "1",
        level: "error",
        text: failure.message,
        failure,
    },
    {
        kind: "turnStatus",
        id: "status",
        sequence: "2",
        status: "failed",
        durationMs: 1_000,
    },
    {
        kind: "notice",
        variant: "configuration",
        id: "provider",
        sequence: "3",
        level: "info",
        text: "Provider selection changed: claude → claude_kirill_for_sms_gmail",
    },
];

it.each([360, 720, 880])(
    "aligns failure, switch and provider rows without borrowing the author gutter at %ipx",
    async (width) => {
        const view = createRenderer();
        for (const lead of [true, false]) {
            view.render(
                () => (
                    <div className="happy-conversation" data-testid={lead ? "lead" : "standalone"}>
                        {entries.map((entry, index) => (
                            <div key={entry.kind === "message" ? entry.message.id : entry.id}>
                                <ConversationEntryView
                                    activityAuthor={lead && index === 0 ? author : undefined}
                                    entry={entry}
                                />
                            </div>
                        ))}
                    </div>
                ),
                { width, height: 360 },
            );
        }
        await view.ready();
        await document.fonts.ready;
        expect(window.devicePixelRatio).toBe(2);
        for (const lead of [true, false]) {
            const root = view.$(`[data-testid="${lead ? "lead" : "standalone"}"]`).element;
            const box = (selector: string) => root.querySelector(selector)!.getBoundingClientRect();
            const edge = root.getBoundingClientRect().left + 30;
            for (const selector of [
                ".happy-conversation-error-card__icon",
                ".happy-conversation-failure-card__resolution-icon",
                ".happy-system-notice__icon",
                ".happy-turn-summary__label",
            ]) {
                expect(box(selector).left, selector).toBe(edge);
            }
            for (const selector of [
                ".happy-conversation-failure-card__message",
                ".happy-conversation-failure-card__resolution-text",
                ".happy-system-notice__text",
            ]) {
                expect(box(selector).left, selector).toBe(edge + 22);
            }
            if (lead) {
                expect(box(".happy-message__author").left).toBe(edge);
                expect(box(".happy-message__gutter").left).toBe(edge - 18);
            }
            const error = box(".happy-conversation-error-card__bubble");
            const resolution = box(".happy-conversation-failure-card__resolution");
            expect(resolution.top - error.bottom).toBe(6);
            expect(resolution.width).toBe(error.width);
            expect(root.scrollWidth).toBe(root.clientWidth);
            if (width === 360) expect(resolution.height).toBeGreaterThan(20);
            for (const [index, row] of [...root.children].entries()) {
                expect(row.getBoundingClientRect().height).toBe(
                    conversationRowHeight(entries, index, {
                        surface: lead ? "conversation" : "chat",
                        width,
                    }),
                );
            }
        }
    },
);
