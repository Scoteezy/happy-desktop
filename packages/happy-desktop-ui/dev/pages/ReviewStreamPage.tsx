import { useState } from "react";
import {
    ReviewStream,
    type ReviewStreamComment,
    type ReviewStreamFile,
} from "../../src/ReviewStream";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-283";

const composerBefore = `export function composerSubmit(text: string): void {
    if (text === "") return;
    send(text);
}
`;

const composerAfter = `export function composerSubmit(text: string, attachments: Attachment[]): void {
    if (text === "" && attachments.length === 0) return;
    send(text, attachments);
}
`;

const storeBefore = `export interface ComposerSnapshot {
    readonly text: string;
}
`;

const storeAfter = `export interface ComposerSnapshot {
    readonly text: string;
    readonly attachments: readonly Attachment[];
}
`;

/* Long enough that its own changes are off screen from one another, which is
   what the steps are for. */
const longBefore = Array.from(
    { length: 90 },
    (_, index) => `export const value${String(index)} = ${String(index)};`,
).join("\n");
const longAfter = longBefore
    .split("\n")
    .map((line, index) =>
        index === 3 || index === 45 || index === 85 ? `${line} // revisited` : line,
    )
    .join("\n");

const files: readonly ReviewStreamFile[] = [
    {
        path: "packages/happy-desktop-ui/src/Composer.tsx",
        oldContent: composerBefore,
        newContent: composerAfter,
    },
    {
        path: "packages/happy-desktop-state/src/composerStore.ts",
        oldContent: storeBefore,
        newContent: storeAfter,
    },
    {
        path: "packages/happy-desktop-ui/src/values.ts",
        oldContent: longBefore,
        newContent: longAfter,
    },
];

function frame(children: React.ReactNode, height = 520, appearance: "dark" | "light" = "light") {
    return (
        <div
            className={appearance === "dark" ? "happy-theme-dark" : "happy-theme-light"}
            style={{
                background: "var(--surface)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                height: `${height}px`,
                overflow: "hidden",
                width: "860px",
            }}
        >
            {children}
        </div>
    );
}

/* The same small state the product's store owns, so the gutter, the composer,
   and the handover control can be exercised here rather than only described. */
function CommentedStream() {
    const [comments, commentsSet] = useState<readonly ReviewStreamComment[]>([
        {
            id: "c1",
            path: "packages/happy-desktop-state/src/composerStore.ts",
            lineNumber: 3,
            side: "additions",
            text: "Give this its own branded type rather than a bare array.",
        },
    ]);
    const [draft, draftSet] = useState<
        | {
              path: string;
              lineNumber: number;
              side: "deletions" | "additions";
              text: string;
          }
        | undefined
    >(undefined);

    return (
        <ReviewStream
            appearance="light"
            commentDraft={draft}
            commentTotal={comments.length}
            comments={comments}
            files={files}
            onCommentDraftCancel={() => draftSet(undefined)}
            onCommentDraftOpen={(path, lineNumber, side) =>
                draftSet({ path, lineNumber, side, text: "" })
            }
            onCommentDraftSubmit={() => {
                if (draft === undefined || draft.text.trim() === "") return;
                commentsSet([
                    ...comments,
                    {
                        id: `c${String(comments.length + 1)}`,
                        path: draft.path,
                        lineNumber: draft.lineNumber,
                        side: draft.side,
                        text: draft.text,
                    },
                ]);
                draftSet(undefined);
            }}
            onCommentDraftUpdate={(text) => draftSet(draft && { ...draft, text })}
            onCommentRemove={(commentId) =>
                commentsSet(comments.filter((comment) => comment.id !== commentId))
            }
            onCommentsSubmit={() => undefined}
        />
    );
}

/**
 * A change whose files are still arriving. Reaching the end of what has been
 * read asks for the next one, which is exactly what the product does against a
 * checkout — here the files are already at hand, so the ask is answered at once.
 */
function ArrivingStream() {
    const [read, readSet] = useState(1);
    return (
        <ReviewStream
            appearance="light"
            files={files.slice(0, read)}
            onEndReach={() => readSet((held) => Math.min(files.length, held + 1))}
            total={files.length}
        />
    );
}

export function ReviewStreamPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Every changed file in one scroll, the way a review is actually read. A diff per pane answers what happened to one file; a change is rarely about one file, and reading it a pane at a time makes the reader hold the order in their head. The steps travel between the changes themselves, from addresses the parsed diff supplies, so a change far below what has been drawn is still somewhere to go."
            title="ReviewStream"
        >
            <Specimen
                detail="Three files, one scroll, one set of steps through every hunk in them"
                label="The whole change"
                number="01"
                stage="surface"
            >
                {frame(<ReviewStream appearance="light" files={files} />)}
            </Specimen>

            <Specimen
                detail="A note belongs to a file and a line; the bar counts them across the whole review, not the file on screen"
                label="Notes across files"
                number="02"
                stage="surface"
            >
                {frame(<CommentedStream />)}
            </Specimen>

            <Specimen
                detail="The same type, spacing, and green a single changed file is drawn with — the surface a review opens from must not change what a diff looks like"
                label="Dark"
                number="04"
                stage="surface"
            >
                {frame(<ReviewStream appearance="dark" files={files} />, 360, "dark")}
            </Specimen>

            <Specimen
                detail="One file is still a review — the count says so, and nothing else changes"
                label="One file"
                number="03"
                stage="surface"
            >
                {frame(<ReviewStream appearance="light" files={files.slice(0, 1)} />, 260)}
            </Specimen>

            <Specimen
                detail="A change is read from the top, so only the first files are read to begin with and the rest are asked for on the way down. The count belongs to the change; what has arrived is said beside it"
                label="Still arriving"
                number="05"
                stage="surface"
            >
                {frame(<ArrivingStream />, 260)}
            </Specimen>
        </ComponentPage>
    );
}
