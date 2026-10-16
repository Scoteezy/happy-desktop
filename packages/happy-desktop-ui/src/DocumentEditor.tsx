import {
    type CollaborationUser,
    filterSuggestionItems,
    getDefaultSlashMenuItems,
} from "@blocknote/core/extensions";
import {
    BlockNoteViewRaw,
    FormattingToolbarController,
    LinkToolbarController,
    SideMenuController,
    SuggestionMenuController,
    useCreateBlockNote,
} from "@blocknote/react";
import { useEffectEvent, useLayoutEffect, useMemo, useRef } from "react";
import {
    Awareness,
    applyAwarenessUpdate,
    encodeAwarenessUpdate,
    removeAwarenessStates,
} from "y-protocols/awareness";
import type * as Y from "yjs";
import type { ToneName } from "./Avatar";
import {
    DocumentFormattingToolbar,
    DocumentLinkToolbar,
    DocumentSideMenu,
    DocumentSlashMenu,
    type DocumentSlashMenuItem,
    documentSlashMenuItems,
} from "./DocumentEditorMenus";
import { useFocusOnType } from "./useFocusOnType";

/**
 * Shared type name of the BlockNote fragment inside a collaborative document
 * Y.Doc. The Happy Agent reads and writes the same fragment, under the same
 * name, with the same BlockNote schema.
 */
export const documentFragmentName = "document";

const remotePresenceOrigin = "happy-remote-presence";

/** Who is writing here, as everyone else in the document sees their caret. */
export interface DocumentEditorUser {
    readonly name: string;
    /** The tone their caret and its label are drawn in. */
    readonly tone: ToneName;
}

/**
 * One remote participant's awareness payload as relayed by the host. The
 * `update` is an opaque base64 y-protocols awareness update produced by that
 * participant's editor; `awarenessClientId` is its numeric Yjs client id so a
 * departed participant's caret can be removed. `clientKey` names that
 * participant's window, and `revision` orders what it says.
 */
export interface DocumentEditorPresence {
    readonly clientKey: string;
    readonly revision: number;
    readonly active: boolean;
    readonly update?: string;
    readonly awarenessClientId?: number;
}

/** The local editor's awareness payload to relay to other participants. */
export interface DocumentEditorPresencePayload {
    readonly update: string;
    readonly awarenessClientId: number;
}

export interface DocumentEditorProps {
    /** Stable collaborative document; the editor binds its BlockNote fragment. */
    ydoc: Y.Doc;
    user: DocumentEditorUser;
    presence?: readonly DocumentEditorPresence[];
    onPresence?: (payload: DocumentEditorPresencePayload) => void;
    /**
     * The pointer went down in the editor, or came back up once the click has
     * placed the caret. Changes from elsewhere applied to `ydoc` in between
     * would put back the caret from before the click, so the owner holds them
     * until it is up.
     */
    onPointerPress?: (pressed: boolean) => void;
    editable?: boolean;
    /**
     * Whether the editor is the window's place to type: a character typed
     * while no other control wants it lands in it, at the caret.
     */
    focusOnType?: boolean;
    /** Puts the caret in the editor whenever it changes; see `useFocusOnType`. */
    focusKey?: string;
    "data-testid"?: string;
}

/** Tone names are carried in the awareness `color` field; anything else is drawn quietly. */
const TONES: ReadonlySet<string> = new Set<ToneName>([
    "violet",
    "ember",
    "mint",
    "ocean",
    "rose",
    "amber",
    "slate",
    "brand",
]);

/**
 * Someone else's caret: a thin bar in their tone, with their name above it
 * while they type or the pointer rests on it. The tone is a name, not a
 * colour, so each window paints it from its own theme.
 */
function cursorRender(user: CollaborationUser): HTMLElement {
    const cursor = document.createElement("span");
    cursor.className = "bn-collaboration-cursor__base";
    cursor.setAttribute("data-tone", TONES.has(user.color) ? user.color : "slate");
    const caret = document.createElement("span");
    caret.className = "bn-collaboration-cursor__caret";
    caret.setAttribute("contenteditable", "false");
    const label = document.createElement("span");
    label.className = "bn-collaboration-cursor__label";
    label.textContent = user.name;
    caret.append(label);
    // Word joiners on both sides keep the caret from breaking a line by itself.
    cursor.append("\u2060", caret, "\u2060");
    return cursor;
}

/**
 * Placeholder text for an empty block, by block type, in sentence case. The
 * first block of an empty document invites writing; any other empty line the
 * caret is on says how to make it something else.
 */
const PLACEHOLDERS = {
    emptyDocument: "Write something, or press / for headings, lists, and more",
    default: "Press / for headings, lists, and more",
    heading: "Heading",
    bulletListItem: "List",
    numberedListItem: "List",
    checkListItem: "To do",
} as const;

/**
 * C-301 DocumentEditor — a WYSIWYG editor over one shared Y.Doc.
 *
 * The document is a CRDT: every keystroke is a Yjs change to the BlockNote
 * fragment, which the host carries to everyone else, and theirs arrive in the
 * same Y.Doc and merge without conflicts. Presence flows through opaque
 * awareness payloads, so the host transport never interprets editor internals.
 *
 * The editor offers only what a Markdown copy of the document can hold:
 * headings, lists, checklists, quotes, code, dividers, and bold, italic,
 * struck-through, code, and linked text. Its menus are drawn in the house
 * style, with the house icon fonts.
 */
export function DocumentEditor(props: DocumentEditorProps) {
    // Identity contract: the Awareness instance and editor must be recreated
    // exactly when the underlying Y.Doc changes, never on ordinary re-renders,
    // or carets and undo history would reset while typing.
    const awareness = useMemo(() => new Awareness(props.ydoc), [props.ydoc]);
    const editor = useCreateBlockNote(
        {
            animations: false,
            placeholders: PLACEHOLDERS,
            collaboration: {
                provider: { awareness },
                fragment: props.ydoc.getXmlFragment(documentFragmentName),
                // The awareness `color` carries the tone's name; `cursorRender`
                // turns it into this window's own colour for that tone.
                user: { name: props.user.name, color: props.user.tone },
                showCursorLabels: "activity",
                renderCursor: cursorRender,
            },
        },
        [props.ydoc, awareness],
    );

    /** Remote presence last applied to the Awareness, by participant. */
    const appliedRef = useRef(new Map<string, DocumentEditorPresence>());
    const pointerHeld = useRef(false);
    /** Remote presence that arrived while a click here was placing the caret. */
    const presenceHeld = useRef<readonly DocumentEditorPresence[] | null>(null);

    const presenceEmit = useEffectEvent((payload: DocumentEditorPresencePayload) =>
        props.onPresence?.(payload),
    );
    // eslint-disable-next-line happy-react/no-layout-effect -- Yjs Awareness is an imperative collaborative-editor resource whose update listener and instance must be attached after commit and completely destroyed with this document
    useLayoutEffect(() => {
        const onUpdate = (
            changes: { added: number[]; updated: number[]; removed: number[] },
            origin: unknown,
        ) => {
            if (origin === remotePresenceOrigin) return;
            const local = awareness.clientID;
            const touchedLocal = [...changes.added, ...changes.updated, ...changes.removed].some(
                (clientId) => clientId === local,
            );
            if (!touchedLocal) return;
            presenceEmit({
                update: base64Encode(encodeAwarenessUpdate(awareness, [local])),
                awarenessClientId: local,
            });
        };
        awareness.on("update", onUpdate);
        const applied = appliedRef.current;
        // The editor seeds its local awareness state during creation, before
        // this listener exists; announce that initial state explicitly.
        if (awareness.getLocalState() !== null)
            presenceEmit({
                update: base64Encode(encodeAwarenessUpdate(awareness, [awareness.clientID])),
                awarenessClientId: awareness.clientID,
            });
        return () => {
            awareness.off("update", onUpdate);
            awareness.destroy();
            // Carets applied to this Awareness, or held for it, go with it.
            applied.clear();
            presenceHeld.current = null;
        };
    }, [awareness]);

    // A remote caret that moves redraws the line it sits on. Redrawn while a
    // click here is still placing this person's caret, ProseMirror puts back
    // the caret from before the click, so remote presence waits until the
    // pointer is released and the click's own caret has been read.
    // Changes to the document itself are redrawn the same way, so the owner
    // holds those too, and lets them go first: the carets held here are
    // placed in the text as it is once they have landed.
    const pointerPress = () => {
        if (pointerHeld.current) return;
        pointerHeld.current = true;
        const pressed = props.onPointerPress;
        pressed?.(true);
        const release = () => {
            window.removeEventListener("pointerup", release, true);
            window.removeEventListener("pointercancel", release, true);
            window.removeEventListener("blur", release);
            window.setTimeout(() => {
                pointerHeld.current = false;
                pressed?.(false);
                const held = presenceHeld.current;
                presenceHeld.current = null;
                if (held !== null) presenceApply(awareness, appliedRef.current, held);
            });
        };
        window.addEventListener("pointerup", release, true);
        window.addEventListener("pointercancel", release, true);
        // A press the window never sees end, because it lost focus first.
        window.addEventListener("blur", release);
    };

    // eslint-disable-next-line happy-react/no-layout-effect -- remote presence payloads must be applied to the live Yjs Awareness instance after the matching document render commits
    useLayoutEffect(() => {
        if (pointerHeld.current) presenceHeld.current = props.presence ?? [];
        else presenceApply(awareness, appliedRef.current, props.presence ?? []);
    }, [awareness, props.presence]);

    const slashItems = async (query: string): Promise<DocumentSlashMenuItem[]> =>
        filterSuggestionItems(documentSlashMenuItems(getDefaultSlashMenuItems(editor)), query);

    /** The editable element itself, for the window's place to type. */
    const writing = useRef<HTMLElement | null>(null);
    useFocusOnType(writing, props.focusOnType === true, props.focusKey);
    const containerAttach = (element: HTMLDivElement | null) => {
        writing.current = element?.querySelector<HTMLElement>(".bn-editor") ?? null;
    };

    return (
        <div
            className="happy-document-editor"
            data-happy-desktop-ui="document-editor"
            onPointerDownCapture={pointerPress}
        >
            <BlockNoteViewRaw
                comments={false}
                data-testid={props["data-testid"]}
                editable={props.editable ?? true}
                editor={editor}
                emojiPicker={false}
                filePanel={false}
                formattingToolbar={false}
                linkToolbar={false}
                ref={containerAttach}
                sideMenu={false}
                slashMenu={false}
                tableHandles={false}
            >
                <FormattingToolbarController formattingToolbar={DocumentFormattingToolbar} />
                <LinkToolbarController linkToolbar={DocumentLinkToolbar} />
                <SideMenuController sideMenu={DocumentSideMenu} />
                <SuggestionMenuController
                    getItems={slashItems}
                    suggestionMenuComponent={DocumentSlashMenu}
                    triggerCharacter="/"
                />
            </BlockNoteViewRaw>
        </div>
    );
}

/**
 * Brings `awareness` up to the remote participants in `entries`: newer
 * payloads are applied, and anyone who left or is no longer listed loses
 * their caret. `applied` remembers what was last applied, by participant.
 */
function presenceApply(
    awareness: Awareness,
    applied: Map<string, DocumentEditorPresence>,
    entries: readonly DocumentEditorPresence[],
) {
    const present = new Set<string>();
    for (const entry of entries) {
        present.add(entry.clientKey);
        const previous = applied.get(entry.clientKey);
        if (previous && previous.revision >= entry.revision) continue;
        applied.set(entry.clientKey, entry);
        if (entry.active && entry.update !== undefined) {
            applyAwarenessUpdate(awareness, base64Decode(entry.update), remotePresenceOrigin);
        } else if (!entry.active && entry.awarenessClientId !== undefined) {
            removeAwarenessStates(awareness, [entry.awarenessClientId], remotePresenceOrigin);
        }
    }
    for (const [clientKey, entry] of applied) {
        if (present.has(clientKey)) continue;
        applied.delete(clientKey);
        if (entry.awarenessClientId !== undefined)
            removeAwarenessStates(awareness, [entry.awarenessClientId], remotePresenceOrigin);
    }
}

function base64Encode(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}
