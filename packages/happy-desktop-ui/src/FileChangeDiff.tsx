import type { ConversationFileDiff } from "happy-desktop-state";
import { DiffSnippet, type DiffLine } from "./DiffSnippet";
import { ScrollArea } from "./Scrollbar";

export type FileChangeDiffProps = {
    /** One file's changes, composed by its owner; the tab around it names the file. */
    file: ConversationFileDiff;
};

function fileChangeLines(file: ConversationFileDiff): DiffLine[] {
    const lines: DiffLine[] = [];
    file.hunks.forEach((hunk, index) => {
        if (index > 0) lines.push({ kind: "meta", text: "⋯" });
        let oldLine = hunk.oldStart;
        let newLine = hunk.newStart;
        for (const line of hunk.lines) {
            if (line.kind === "add") {
                lines.push({ kind: "add", number: newLine, text: line.text });
                newLine += 1;
            } else if (line.kind === "delete") {
                lines.push({ kind: "del", number: oldLine, text: line.text });
                oldLine += 1;
            } else {
                lines.push({ kind: "context", number: newLine, text: line.text });
                oldLine += 1;
                newLine += 1;
            }
        }
    });
    return lines;
}

/** One file's changes as a single diff, with nothing around it the tab already says. */
export function FileChangeDiff(props: FileChangeDiffProps) {
    return (
        <ScrollArea
            axes="both"
            className="happy-file-change-diff"
            data-happy-desktop-ui="file-change-diff"
            viewportClassName="happy-file-change-diff__viewport"
        >
            <DiffSnippet lines={fileChangeLines(props.file)} wrap />
        </ScrollArea>
    );
}
