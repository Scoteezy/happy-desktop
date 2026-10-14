import { type ReactNode } from "react";
import { ChangedFileList, type ChangedFileListEntry } from "../../src/ChangedFileList";
import { type DiffLine } from "../../src/DiffSnippet";
import { diffSnippetLanguage } from "../../src/diffSnippetHighlight";
import { FlowDiagram } from "../../src/FlowDiagram";
import { MermaidDiagram } from "../../src/MermaidDiagram";
import { happyUiDiffDisplayLines, happyUiDiffLines } from "../../src/happyUiGrounding";
import { renderMessageMarkdown } from "../../src/MessageMarkdown";
import { ReviewDiff, type ReviewDiffStatus } from "../../src/ReviewDiff";
import { ReviewFinding, ReviewVerdict } from "../../src/ReviewFinding";
import { guidedReviewFixture } from "../fixtures/guided-review/fixtures";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-297";

/*
 * The parts a guided review is drawn with, in the flow of a chat reply
 * rather than inside a card: quoted lines, the changed files, findings, the
 * verdict, and a chapter that puts its words beside what shows them once
 * the column is wide. Lines and counts come from a frozen real change.
 */

const fixture = guidedReviewFixture("messy-senders");

/* Counts for the files whose text was not frozen with the change. */
const UNFROZEN_COUNTS: Readonly<Record<string, readonly [number, number]>> = {
    "packages/happy-desktop-app/sources/AppHappyAgentView.tsx": [14, 3],
    "packages/happy-desktop-app/tests/behavior/joined_tasks_list_under_bots.test.tsx": [22, 6],
    "packages/happy-desktop-state/src/happyAgent/happyAgentAgentIdentities.test.ts": [148, 0],
    "packages/happy-desktop-state/src/happyAgent/happyAgentChatStore.senders.test.ts": [96, 0],
    "packages/happy-desktop-state/src/happyAgent/happyAgentClient.ts": [9, 1],
    "packages/happy-desktop-state/src/happyAgent/happyAgentConversationProject.ts": [4, 2],
    "packages/happy-desktop-ui/dev/pages/AgentActivityRowPage.tsx": [31, 4],
    "packages/happy-desktop-ui/dev/pages/CommandPalettePage.tsx": [6, 6],
    "packages/happy-desktop-ui/dev/pages/CommandPaletteResultsPage.tsx": [3, 3],
    "packages/happy-desktop-ui/dev/pages/QuickActionsCardPage.tsx": [2, 2],
    "packages/happy-desktop-ui/dev/pages/SidebarPage.tsx": [5, 5],
    "packages/happy-desktop-ui/src/AgentActivityRow.test.tsx": [58, 2],
    "packages/happy-desktop-ui/src/Sidebar.tsx": [7, 4],
    "packages/happy-desktop-ui/src/styles/sidebar.css": [3, 0],
};

function fileCounts(path: string): ChangedFileListEntry {
    const contents = fixture.contents[path];
    if (contents === undefined) {
        const [added, removed] = UNFROZEN_COUNTS[path] ?? [0, 0];
        return { path, added, removed };
    }
    // Both sides' length bounds every line number either one can have.
    const endLine =
        Math.max(contents.oldContent.split("\n").length, contents.newContent.split("\n").length) +
        1;
    const whole = happyUiDiffLines({ path, ...contents }, { startLine: 1, endLine });
    return { path, added: whole.added, removed: whole.removed };
}

const allFiles: readonly ChangedFileListEntry[] = fixture.files.map((file) =>
    fileCounts(file.path),
);

const testFiles = allFiles.filter(
    (file) => file.path.includes(".test.") || file.path.includes("/dev/pages/"),
);

function Quote(props: { path: string; from: number; to: number }) {
    const contents = fixture.contents[props.path];
    const view =
        contents === undefined
            ? undefined
            : happyUiDiffLines(
                  { path: props.path, ...contents },
                  { startLine: props.from, endLine: props.to },
              );
    const status = fixture.files.find((file) => file.path === props.path)?.status;
    const language = diffSnippetLanguage(props.path);
    return (
        <ReviewDiff
            lines={happyUiDiffDisplayLines(view)}
            onOpen={() => undefined}
            path={props.path}
            {...(language === undefined ? {} : { language })}
            {...(status === undefined ? {} : { status: status as ReviewDiffStatus })}
            {...(view === undefined ? {} : { stats: { added: view.added, removed: view.removed } })}
        />
    );
}

/** Prose as the reply's own Markdown draws it. */
function Prose(props: { children: string }) {
    return (
        <div className="happy-message__body happy-message__body--markdown" data-markdown="">
            {renderMessageMarkdown(props.children)}
        </div>
    );
}

const senderFlow = [
    "Transcript -> ChatStore [changed 2]: sender ids",
    "ChatStore -> AgentIdentities [new 1]: lookup",
    "AgentIdentities -> SessionList: index",
    "AgentIdentities -> getAgent [new 1]: unknown id",
    "ChatStore -> AgentActivityRow [changed 3]: face",
    "AgentActivityRow -> AgentMessageFace [new 3]",
    "AgentMessageFace -> AgentsGlyph [gone]",
].join("\n");

/* Written by an agent reviewing a real commit: three labelled arrows into one part. */
const convergingFlow = [
    "HappyUiBlock [changed 2] -> DiffSnippet [changed 2]: language",
    "ToolCallPreview -> DiffSnippet: no language",
    "AgentActivityRow -> DiffSnippet: no language",
    "DiffSnippet -> diffSnippetHighlight [new 1]: lines",
    "diffSnippetHighlight -> Pierre highlighter: grammar",
    "MermaidDiagram [changed 3] -> Beautiful Mermaid: radius, colours",
].join("\n");

// Two labelled arrows from neighbours into one part, and a jump into a part
// with a neighbour on its right.
const crowdedFlow = [
    "ConversationView -> MessageList: estimateRowSize",
    "document.fonts -> MessageList: estimateVersion",
    "MessageList -> conversationRowHeight: index, width",
    "conversationRowHeight -> RowHeightCache: entry, key",
    "conversationRowHeight -> messageRowHeight: message rows",
    "messageRowHeight -> markdownBodyHeight: body, measure",
    "markdownBodyHeight -> Pretext: line count",
    "document.fonts -> RowHeightCache: generation reset",
].join("\n");

const senderFlowMermaid = [
    "flowchart TD",
    "  T[Transcript] -->|sender ids| C[ChatStore]",
    "  C -->|lookup| I[AgentIdentities]",
    "  I -->|index| S[SessionList]",
    "  I -->|unknown id| G[getAgent]",
    "  C -->|face| R[AgentActivityRow]",
    "  R --> F[AgentMessageFace]",
].join("\n");

/** A reply column at a transcript measure, the parts stacked 20px apart. */
function Column(props: { children: ReactNode; screen: string; width: number }) {
    return (
        <div
            data-screen={props.screen}
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 20,
                width: props.width,
                padding: 24,
                boxSizing: "content-box",
                background: "var(--surface)",
            }}
        >
            {props.children}
        </div>
    );
}

const addedLines: readonly DiffLine[] = [
    { kind: "add", number: 1, text: "export function DiffStat(props: { added: number }) {" },
    { kind: "add", number: 2, text: "    return <span>+{props.added}</span>;" },
    { kind: "add", number: 3, text: "}" },
];

export function GuidedReviewComponentsPage() {
    return (
        <ComponentPage
            summary="The parts a guided review is drawn with: quoted lines, changed files, findings and the verdict, and Happy's own flow diagram. Whole replies are on the Guided review fixtures page."
            number={componentNumber}
            title="Guided review components"
        >
            <Specimen
                detail="Quoted lines: a modified file, an added file, and lines that cannot be read"
                label="Diff"
                number="03"
                stage="surface"
            >
                <Column screen="03-diff" width={560}>
                    <Quote
                        from={1113}
                        path="packages/happy-desktop-ui/src/AgentActivityRow.tsx"
                        to={1124}
                    />
                    <ReviewDiff
                        language="tsx"
                        lines={addedLines}
                        path="packages/happy-desktop-ui/src/DiffStat.tsx"
                        stats={{ added: 3, removed: 0 }}
                        status="added"
                    />
                    <ReviewDiff
                        lines={[{ kind: "meta", text: "Not part of this change." }]}
                        path="packages/happy-desktop-ui/src/Elsewhere.ts"
                    />
                </Column>
            </Specimen>
            <Specimen
                detail="All changed files, two columns from 560px; and a chapter's slice"
                label="Files"
                number="04"
                stage="surface"
            >
                <Column screen="04-files" width={832}>
                    <ChangedFileList files={allFiles} onFileOpen={() => undefined} />
                    <div style={{ width: 420 }}>
                        <ChangedFileList files={testFiles} onFileOpen={() => undefined} />
                    </div>
                </Column>
            </Specimen>
            <Specimen
                detail="A verdict with no findings, and one finding of each severity"
                label="Findings"
                number="05"
                stage="surface"
            >
                <Column screen="05-findings" width={560}>
                    <ReviewVerdict severities={[]}>
                        <Prose>Ready to merge.</Prose>
                    </ReviewVerdict>
                    <ReviewFinding severity="high" title="Tokens are logged in plain text">
                        <Prose>The request logger prints the `Authorization` header.</Prose>
                    </ReviewFinding>
                    <ReviewFinding severity="medium" title="A failed lookup is never retried">
                        <Prose>One network blip leaves the sender unnamed until reload.</Prose>
                    </ReviewFinding>
                    <ReviewFinding severity="low" title="A comment still says 20px">
                        <Prose>The inset is 30px now.</Prose>
                    </ReviewFinding>
                </Column>
            </Specimen>
            <Specimen
                detail="Happy’s own flow: mono names, new parts with a green rule and a plus, changed with a dark rule, removed struck through, chapter chips; ranks snake to fit the column"
                label="Flow"
                number="06"
                stage="surface"
            >
                <Column screen="06-flow-wide" width={832}>
                    <FlowDiagram source={senderFlow} />
                </Column>
                <Column screen="07-flow-528" width={528}>
                    <FlowDiagram source={senderFlow} />
                </Column>
                <Column screen="08-flow-narrow" width={420}>
                    <FlowDiagram source={senderFlow} />
                </Column>
                <Column screen="08b-flow-converging" width={720}>
                    <FlowDiagram source={convergingFlow} />
                </Column>
                <Column screen="08c-flow-crowded" width={720}>
                    <FlowDiagram source={crowdedFlow} />
                </Column>
            </Specimen>
            <Specimen
                detail="The same flow through the Mermaid renderer the chat uses today, for comparison"
                label="Flow, Mermaid"
                number="07"
                stage="surface"
            >
                <Column screen="09-mermaid-420" width={420}>
                    <MermaidDiagram source={senderFlowMermaid} />
                </Column>
            </Specimen>
        </ComponentPage>
    );
}
