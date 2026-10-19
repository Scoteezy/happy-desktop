import type {
    ConversationDiffHunk,
    ConversationDiffLine,
    ConversationEntry,
    ConversationFileDiff,
} from "./conversationEntry.js";

/** One file a conversation's edits touched, with the lines they changed. */
export interface ConversationFileChange {
    readonly path: string;
    readonly added: number;
    readonly deleted: number;
}

/**
 * The file as the conversation's edits have seen it: lines it never showed are
 * a gap of unknown length, lines it showed are the base unless an edit wrote
 * them, and a base line an edit removed stays as a deletion without a place in
 * the current file.
 */
type Line =
    | { readonly type: "gap"; readonly count: number }
    | { readonly type: "base"; readonly text: string }
    | { readonly type: "add"; readonly text: string }
    | { readonly type: "delete"; readonly text: string };

/** How many lines of the current file one item occupies. */
function lineSpan(line: Line): number {
    return line.type === "gap" ? line.count : line.type === "delete" ? 0 : 1;
}

/** Makes `position` (1-based, in the current file) start an item, and returns its index. */
function lineBoundary(lines: Line[], position: number): number {
    let start = 1;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        if (start === position && line.type !== "delete") return index;
        const span = lineSpan(line);
        if (line.type === "gap" && position > start && position < start + span) {
            lines.splice(
                index,
                1,
                { type: "gap", count: position - start },
                { type: "gap", count: span - (position - start) },
            );
            return index + 1;
        }
        start += span;
    }
    return lines.length;
}

/** Applies one edit's hunks, which count lines in the file as it stood before that edit. */
function hunksApply(lines: Line[], hunks: readonly ConversationDiffHunk[]): void {
    // From the bottom up, so each hunk's line numbers still hold when it lands.
    const ordered = [...hunks].sort((left, right) => right.oldStart - left.oldStart);
    for (const hunk of ordered) {
        const old = hunk.lines.filter((line) => line.kind !== "add");
        const start = old.length === 0 ? hunk.oldStart + 1 : Math.max(1, hunk.oldStart);
        let cursor = lineBoundary(lines, start);
        if (old.length > 0) lineBoundary(lines, start + old.length);
        // The lines the hunk names stop being unknown: they read as it says.
        let known = cursor;
        for (const line of old) {
            while (lines[known]?.type === "delete") known += 1;
            const at = lines[known];
            if (at === undefined) {
                lines.push({ type: "base", text: line.text });
            } else if (at.type === "gap") {
                lines.splice(
                    known,
                    1,
                    { type: "base", text: line.text },
                    ...(at.count > 1 ? [{ type: "gap" as const, count: at.count - 1 }] : []),
                );
            }
            known += 1;
        }
        for (const line of hunk.lines) {
            while (lines[cursor]?.type === "delete") cursor += 1;
            if (line.kind === "add") {
                lines.splice(cursor, 0, { type: "add", text: line.text });
                cursor += 1;
            } else if (line.kind === "context") {
                cursor += 1;
            } else {
                const at = lines[cursor];
                // A line this conversation wrote and then removed was never a change.
                if (at?.type === "add") lines.splice(cursor, 1);
                else if (at !== undefined) {
                    lines[cursor] = {
                        type: "delete",
                        text: at.type === "base" ? at.text : line.text,
                    };
                    cursor += 1;
                }
            }
        }
    }
}

/** Replaces the whole file: what the conversation wrote is gone, the base it showed deleted. */
function fileReplace(lines: Line[], next: readonly ConversationDiffLine[]): Line[] {
    return [
        ...lines.flatMap((line): Line[] =>
            line.type === "base" || line.type === "delete"
                ? [{ type: "delete", text: line.text }]
                : [],
        ),
        ...next.map((line): Line => ({ type: "add", text: line.text })),
    ];
}

const CONTEXT_LINES = 3;

/** The changed lines with a little of the known file around them, as hunks. */
function hunksOf(lines: readonly Line[]): ConversationDiffHunk[] {
    const changed = (line: Line | undefined) => line?.type === "add" || line?.type === "delete";
    const shown = new Set<number>();
    lines.forEach((line, index) => {
        if (!changed(line)) return;
        shown.add(index);
        for (const step of [-1, 1]) {
            let context = 0;
            for (let at = index + step; at >= 0 && at < lines.length; at += step) {
                const near = lines[at]!;
                if (near.type === "gap") break;
                if (near.type === "base") {
                    if (context === CONTEXT_LINES) break;
                    context += 1;
                }
                shown.add(at);
            }
        }
    });
    const hunks: ConversationDiffHunk[] = [];
    let current: { oldStart: number; newStart: number; lines: ConversationDiffLine[] } | undefined;
    let oldLine = 1;
    let newLine = 1;
    lines.forEach((line, index) => {
        if (!shown.has(index)) {
            current = undefined;
        } else {
            if (current === undefined) {
                current = { oldStart: oldLine, newStart: newLine, lines: [] };
                hunks.push(current);
            }
            current.lines.push({
                kind: line.type === "base" ? "context" : line.type === "add" ? "add" : "delete",
                text: line.type === "gap" ? "" : line.text,
            });
        }
        if (line.type === "gap") {
            oldLine += line.count;
            newLine += line.count;
        } else {
            if (line.type !== "add") oldLine += 1;
            if (line.type !== "delete") newLine += 1;
        }
    });
    return hunks;
}

/** The edits a conversation made to files, in the order they were made. A failed call changed nothing. */
function fileDiffsOf(entries: readonly ConversationEntry[]): readonly ConversationFileDiff[] {
    const diffs: ConversationFileDiff[] = [];
    for (const entry of entries) {
        if (entry.kind !== "agentActivity" || entry.activity.kind !== "tool") continue;
        const tool = entry.activity.tool;
        if (tool.failed || tool.presentation?.type !== "fileDiff") continue;
        diffs.push(...tool.presentation.files);
    }
    return diffs;
}

/** Every edit to one file, folded into one diff against the file before the first of them. */
function fileDiffCompose(
    path: string,
    edits: readonly ConversationFileDiff[],
): ConversationFileDiff {
    const created = edits[0]?.kind === "add";
    let lines: Line[] = created ? [] : [{ type: "gap", count: Number.POSITIVE_INFINITY }];
    for (const edit of edits) {
        if (edit.kind !== "add") hunksApply(lines, edit.hunks);
        if (edit.kind !== "update")
            lines = fileReplace(
                lines.filter((line) => line.type !== "gap"),
                edit.kind === "add" ? edit.hunks.flatMap((hunk) => hunk.lines) : [],
            );
    }
    let added = 0;
    let deleted = 0;
    for (const line of lines) {
        if (line.type === "add") added += 1;
        else if (line.type === "delete") deleted += 1;
    }
    const last = edits.at(-1);
    return {
        path,
        kind: created ? "add" : last?.kind === "delete" ? "delete" : "update",
        hunks: hunksOf(lines),
        ...(last?.language === undefined ? {} : { language: last.language }),
        added,
        deleted,
    };
}

/**
 * Everything a conversation's edits did to one file, as one diff against the
 * file before the first of them. This is the record for work outside a Git
 * checkout, which has no working-tree diff to read; its counts are the ones
 * `conversationFileChanges` reports for the same file.
 */
export function conversationFileDiff(
    entries: readonly ConversationEntry[],
    path: string,
): ConversationFileDiff | undefined {
    const edits = fileDiffsOf(entries).filter((edit) => edit.path === path);
    return edits.length === 0 ? undefined : fileDiffCompose(path, edits);
}

/**
 * The files a conversation changed, in the order they were first edited, each
 * counted from its composed diff: a line written and then removed again is not
 * a change, and a file whose edits cancel out is left out.
 */
export function conversationFileChanges(
    entries: readonly ConversationEntry[],
): readonly ConversationFileChange[] {
    const edits = new Map<string, ConversationFileDiff[]>();
    for (const edit of fileDiffsOf(entries)) {
        const known = edits.get(edit.path);
        if (known) known.push(edit);
        else edits.set(edit.path, [edit]);
    }
    return [...edits].flatMap(([path, fileEdits]) => {
        const diff = fileDiffCompose(path, fileEdits);
        const added = diff.added ?? 0;
        const deleted = diff.deleted ?? 0;
        return added === 0 && deleted === 0 ? [] : [{ path, added, deleted }];
    });
}
