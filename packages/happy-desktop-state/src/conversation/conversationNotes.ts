import type { ConversationEntry } from "./conversationEntry.js";

/** What one bookkeeping note reads as once it is folded into a summary row. */
export interface ConversationNote {
    readonly label: string;
    readonly details: readonly string[];
}

/**
 * Folds the notes a Happy Agent wrote without a model turn into one summary
 * row each, keyed by the durable message ID it gave the note. The run that
 * carried a note held nothing else, so its footer goes with it: a record has no
 * duration worth reading.
 */
export function conversationNotesFold(
    entries: readonly ConversationEntry[],
    notes: ReadonlyMap<string, ConversationNote>,
): readonly ConversationEntry[] {
    if (notes.size === 0) return entries;
    const noteRuns = new Set<string>();
    for (const entry of entries)
        if (
            entry.kind === "message" &&
            entry.messageId !== undefined &&
            entry.runId !== undefined &&
            notes.has(entry.messageId)
        )
            noteRuns.add(entry.runId);
    if (noteRuns.size === 0) return entries;
    return entries.flatMap((entry): ConversationEntry[] => {
        if (entry.kind === "turnStatus" && entry.runId !== undefined && noteRuns.has(entry.runId))
            return [];
        const note =
            entry.kind === "message" && entry.messageId !== undefined
                ? notes.get(entry.messageId)
                : undefined;
        if (entry.kind !== "message" || note === undefined) return [entry];
        return [
            {
                kind: "summary",
                id: entry.message.id,
                sequence: entry.message.sequence,
                label: note.label,
                details: note.details,
            },
        ];
    });
}
