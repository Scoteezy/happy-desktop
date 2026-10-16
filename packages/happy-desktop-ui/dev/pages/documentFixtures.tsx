import { BlockNoteEditor } from "@blocknote/core";
import { blocksToYXmlFragment } from "@blocknote/core/yjs";
import { useState } from "react";
import * as Y from "yjs";
import {
    documentFragmentName,
    type DocumentEditorPresence,
    type DocumentEditorPresencePayload,
    type DocumentEditorUser,
} from "../../src/DocumentEditor";
import type { HappyAgentDocumentSync } from "../../src/pages/surfaces/HappyAgentDocumentSurfacePage";

/*
 * Shared documents for the workbench, held in memory: a Y.Doc made from
 * Markdown, and pairs of them joined to each other the way two windows on one
 * document are joined through their Happy Agent.
 */

let parser: BlockNoteEditor | undefined;

/** A fresh shared document whose content is `markdown`, in the editor's own schema. */
export function documentDocFromMarkdown(markdown: string): Y.Doc {
    parser ??= BlockNoteEditor.create();
    const doc = new Y.Doc();
    if (markdown.length > 0)
        blocksToYXmlFragment(
            parser,
            parser.tryParseMarkdownToBlocks(markdown),
            doc.getXmlFragment(documentFragmentName),
        );
    return doc;
}

/** One window's side of a document shared by two. */
export interface DocumentWindow {
    readonly ydoc: Y.Doc;
    readonly user: DocumentEditorUser;
    readonly presence: readonly DocumentEditorPresence[];
    readonly onPresence: (payload: DocumentEditorPresencePayload) => void;
    readonly sync: HappyAgentDocumentSync;
}

/**
 * Two windows on one document, as two people see it: every change made in
 * either arrives in the other, and each sees the other's caret. A change shows
 * "Saving…" in the window it was made in until it has had a moment to arrive.
 */
export function useDocumentPair(
    markdown: string,
    users: readonly [DocumentEditorUser, DocumentEditorUser],
): readonly [DocumentWindow, DocumentWindow] {
    const [presence, setPresence] = useState<
        readonly [readonly DocumentEditorPresence[], readonly DocumentEditorPresence[]]
    >([[], []]);
    const [saving, setSaving] = useState<readonly [boolean, boolean]>([false, false]);
    // The documents and what joins them are made together, once, so a second
    // run of this initializer leaves nothing joined behind.
    const [pair] = useState(() => {
        const left = documentDocFromMarkdown(markdown);
        const right = new Y.Doc();
        Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
        const docs = [left, right] as const;
        const timers: [number | undefined, number | undefined] = [undefined, undefined];
        const savingSet = (from: 0 | 1, value: boolean) =>
            setSaving((current) => (from === 0 ? [value, current[1]] : [current[0], value]));
        for (const from of [0, 1] as const) {
            const source = docs[from];
            const target = docs[from === 0 ? 1 : 0];
            source.on("update", (update: Uint8Array, origin: unknown) => {
                if (origin === target) return;
                Y.applyUpdate(target, update, source);
                savingSet(from, true);
                window.clearTimeout(timers[from]);
                timers[from] = window.setTimeout(() => savingSet(from, false), 600);
            });
        }
        return { docs, revisions: [0, 0] as [number, number] };
    });
    const side = (index: 0 | 1): DocumentWindow => ({
        ydoc: pair.docs[index],
        user: users[index],
        presence: presence[index],
        onPresence: (payload) => {
            pair.revisions[index] += 1;
            const entry: DocumentEditorPresence = {
                clientId: `window-${String(index)}`,
                revision: pair.revisions[index],
                active: true,
                update: payload.update,
                awarenessClientId: payload.awarenessClientId,
            };
            // What one window says about itself is what the other sees.
            setPresence((current) => (index === 0 ? [current[0], [entry]] : [[entry], current[1]]));
        },
        sync: saving[index] ? "saving" : "saved",
    });
    return [side(0), side(1)];
}

/** One window on a document no one else has open. */
export function useDocumentAlone(markdown: string, user: DocumentEditorUser): DocumentWindow {
    const [ydoc] = useState(() => documentDocFromMarkdown(markdown));
    return { ydoc, user, presence: [], onPresence: () => undefined, sync: "saved" };
}
