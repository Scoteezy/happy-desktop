import type {
    HappyAgentAttentionItem,
    HappyAgentGroupId,
    HappyAgentInboxItem,
    HappyAgentInboxItemId,
    HappyAgentInboxSubmission,
    HappyAgentProjectId,
    HappyAgentSessionId,
} from "happy-desktop-state";
import { commandShortcut, keyShortcut } from "../../src/keyboardShortcut";
import { HappyAgentAttentionPage } from "../../src/pages/attention/HappyAgentAttentionPage";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-014";

const question: HappyAgentInboxItem = {
    id: "q-one" as HappyAgentInboxItemId,
    sessionId: "session-one" as HappyAgentSessionId,
    requestId: "req-one",
    scope: { kind: "project", projectId: "project-1" as HappyAgentProjectId },
    createdAt: 1_700_000_000_000,
    status: "pending",
    sessionTitle: "Migrate the plugin permission table",
    questions: [
        {
            id: "approach",
            header: "Approach",
            question: "How should the migration run?",
            multiSelect: false,
            required: true,
            options: [
                { label: "In one transaction", description: "Atomic but locks the table longer." },
                { label: "In batches", description: "Lower lock contention, slower overall." },
            ],
        },
    ],
} as unknown as HappyAgentInboxItem;

const item = (
    key: string,
    overrides: Partial<HappyAgentAttentionItem> &
        Pick<HappyAgentAttentionItem, "title" | "reason" | "place">,
): HappyAgentAttentionItem => ({
    key: `mac/${key}`,
    happyAgentId: "mac",
    sessionId: key as HappyAgentSessionId,
    groupId: "project-1" as HappyAgentGroupId,
    since: 1_700_000_000_000,
    ...overrides,
});

const items: readonly HappyAgentAttentionItem[] = [
    item("session-one", {
        title: "Migrate the plugin permission table",
        reason: "attention_needed",
        place: { kind: "project", projectId: "project-1", projectName: "happy", home: false },
        question,
    }),
    item("session-two", {
        title: "Approve the release workflow change",
        reason: "attention_needed",
        place: {
            kind: "workspace",
            projectId: "project-1",
            projectName: "happy",
            home: false,
            worktreeName: "feat/release",
        },
        since: 1_700_000_100_000,
    }),
    item("session-three", {
        title: "Weekly dependency sweep",
        reason: "turn_finished",
        place: { kind: "bot", botId: "bot-1", botName: "Sweeper" },
        since: 1_700_000_200_000,
    }),
    item("session-four", {
        title: "Rewrite the changed-files header",
        reason: "turn_finished",
        place: { kind: "project", projectId: "home", projectName: "~", home: true },
        since: 1_700_000_300_000,
    }),
];

const pending: ReadonlyMap<string, HappyAgentInboxSubmission> = new Map([
    ["mac/session-one", { type: "pending" } as HappyAgentInboxSubmission],
]);

const failed: ReadonlyMap<string, HappyAgentInboxSubmission> = new Map([
    [
        "mac/session-one",
        {
            type: "failed",
            error: { name: "UserError", message: "The Happy Agent refused the answer." },
        } as HappyAgentInboxSubmission,
    ],
]);

const time = (candidate: HappyAgentAttentionItem): string =>
    candidate.reason === "attention_needed" ? "waiting 12m" : "3m ago";

const nextShortcut = commandShortcut("u", { shift: true });
const readAllShortcut = keyShortcut("escape", { shift: true });

export function HappyAgentAttentionBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The queue of conversations waiting on the person across every connected machine: agents blocked on an answer first, oldest first, then turns that finished. A blocked row with a question the machine has words for is answered in place; every other row opens, and a finished one can simply be marked seen."
            title="HappyAgentAttentionPage"
        >
            <FullScreenSpecimen
                detail="Two blocked rows — one with an inline question, one that must be opened — above two finished turns from a bot and the home project."
                label="Queue"
                number="01"
            >
                <HappyAgentAttentionPage
                    itemTime={time}
                    items={items}
                    nextShortcut={nextShortcut}
                    onAnswer={() => undefined}
                    onMessageChange={() => undefined}
                    onMessageSubmit={() => undefined}
                    onOpen={() => undefined}
                    onRead={() => undefined}
                    onReadAll={() => undefined}
                    questionMessage={() => ""}
                    readAllShortcut={readAllShortcut}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The first row's answer is on its way; its controls wait."
                label="Answer sending"
                number="02"
            >
                <HappyAgentAttentionPage
                    itemTime={time}
                    items={items.slice(0, 1)}
                    onAnswer={() => undefined}
                    onOpen={() => undefined}
                    questionSubmission={(candidate) => pending.get(candidate.key)}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The machine refused the answer; the row keeps its selection so the retry sends the same thing."
                label="Answer not sent"
                number="03"
            >
                <HappyAgentAttentionPage
                    itemTime={time}
                    items={items.slice(0, 1)}
                    onAnswer={() => undefined}
                    onOpen={() => undefined}
                    questionSubmission={(candidate) => failed.get(candidate.key)}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen detail="Nothing is waiting." label="Empty" number="04">
                <HappyAgentAttentionPage items={[]} onOpen={() => undefined} />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The machine is reconnecting; rows stay readable, answers wait."
                label="Unavailable"
                number="05"
            >
                <HappyAgentAttentionPage
                    itemTime={time}
                    items={items}
                    onAnswer={() => undefined}
                    onOpen={() => undefined}
                    onRead={() => undefined}
                    unavailable="Reconnecting to this Mac…"
                />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
