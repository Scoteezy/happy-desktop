import { useLayoutEffect, useRef, type CSSProperties, type MouseEvent } from "react";
import {
    HAPPY_AGENT_SURFACE_DOCUMENT_TEXT_LIMIT,
    type HappyAgentSurfaceDocumentSnapshot,
} from "happy-desktop-state";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { MarkdownDocument } from "../../MarkdownDocument";
import { ScrollArea } from "../../Scrollbar";
import { useFocusOnType } from "../../useFocusOnType";
import { HappyAgentSurfaceHeader } from "./HappyAgentSurfaceHeader";
import type { HappyAgentSurfaceView } from "./surfacePresentation";

export interface HappyAgentDocumentSurfacePageProps {
    surface: HappyAgentSurfaceView;
    /** The document as its store holds it, with the reader's own typing applied. */
    document: HappyAgentSurfaceDocumentSnapshot;
    /** Opens the text for writing. */
    onEditStart: () => void;
    /** Closes the text and shows it rendered again. */
    onEditEnd: () => void;
    onTextChange: (text: string) => void;
    onConflictDismiss: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/** Where the caret goes when the text opens, and where on screen its line should sit. */
interface CaretPlacement {
    readonly offset: number;
    /** From the top of the page's body; absent to leave the text scrolled to its top. */
    readonly top?: number;
}

/** Where `offset` in `before` lands once the text is `after`: on the same character, outside the change. */
function caretCarried(before: string, after: string, offset: number): number {
    const limit = Math.min(before.length, after.length);
    let head = 0;
    while (head < limit && before.charCodeAt(head) === after.charCodeAt(head)) head += 1;
    let tail = 0;
    while (
        tail < limit - head &&
        before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)
    )
        tail += 1;
    if (offset <= head) return offset;
    if (offset >= before.length - tail) return offset + after.length - before.length;
    return after.length - tail;
}

/**
 * How far below the textarea's top the line holding `offset` starts. A text
 * control does not say where its caret is drawn, so the text before it is
 * laid out once in an invisible copy of the control and measured.
 */
function caretLineTop(element: HTMLTextAreaElement, offset: number): number {
    const style = getComputedStyle(element);
    const copy = element.ownerDocument.createElement("div");
    copy.style.position = "absolute";
    copy.style.visibility = "hidden";
    copy.style.boxSizing = "content-box";
    copy.style.width = `${String(element.clientWidth)}px`;
    copy.style.whiteSpace = "pre-wrap";
    copy.style.overflowWrap = "break-word";
    copy.style.font = style.font;
    copy.style.letterSpacing = style.letterSpacing;
    copy.style.tabSize = style.tabSize;
    copy.textContent = element.value.slice(0, offset);
    // The line the caret is on is the copy's last; a mark after the text gives
    // an empty last line its height.
    copy.append("\u200b");
    element.parentElement?.append(copy);
    const height = copy.offsetHeight;
    copy.remove();
    return Math.max(0, height - Number.parseFloat(style.lineHeight));
}

/**
 * HappyAgentDocumentSurfacePage — one shared Markdown document: its header,
 * then the document rendered on the reading measure, or its Markdown open for
 * writing in the same place.
 *
 * A click on the rendered text opens it for writing with the caret on the
 * character clicked, its line where the clicked line was; outside prose the
 * caret goes to the start of the block clicked. A click on a link or with
 * text selected is left alone. Escape,
 * Cmd+Enter, or Done closes it again. There is no Save: typing applies at
 * once and the store saves it as it rests, so the header only says whether
 * everything has arrived.
 *
 * Someone else's change can arrive while the reader writes. The text then
 * changes around the caret, which stays on the character it was on.
 */
export function HappyAgentDocumentSurfacePage(props: HappyAgentDocumentSurfacePageProps) {
    const snapshot = props.document;
    const textarea = useRef<HTMLTextAreaElement>(null);
    /** Where the caret goes when the text next opens for writing. */
    const caretPending = useRef<CaretPlacement | undefined>(undefined);
    /** The text and selection as the textarea last reported them. */
    const seen = useRef<{ value: string; start: number; end: number } | undefined>(undefined);
    const remember = (element: HTMLTextAreaElement) => {
        seen.current = {
            value: element.value,
            start: element.selectionStart,
            end: element.selectionEnd,
        };
    };
    useFocusOnType(textarea, snapshot.editing, snapshot.editing ? snapshot.surfaceId : undefined);
    // eslint-disable-next-line happy-react/no-layout-effect -- a controlled textarea whose value is replaced by someone else's change puts the caret at the end; carrying it to the same character needs the committed DOM selection, which no handler or ref callback sees
    useLayoutEffect(() => {
        const element = textarea.current;
        const last = seen.current;
        if (element === null || last === undefined || last.value === snapshot.text) return;
        const start = caretCarried(last.value, snapshot.text, last.start);
        const end = caretCarried(last.value, snapshot.text, last.end);
        if (element.ownerDocument.activeElement === element) element.setSelectionRange(start, end);
        seen.current = { value: snapshot.text, start, end };
    }, [snapshot.text]);
    const editStart = (caret: CaretPlacement) => {
        caretPending.current = caret;
        props.onEditStart();
    };
    const readClick = (event: MouseEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("a, button, input, summary")) return;
        const page = event.currentTarget.ownerDocument;
        // A drag that selected text is someone reading, not asking to write.
        if (page.getSelection()?.isCollapsed === false) return;
        const bodyTop = event.currentTarget.getBoundingClientRect().top;
        // The character clicked, when it is prose the renderer marked with its
        // place in the Markdown.
        const point = page.caretPositionFromPoint(event.clientX, event.clientY);
        const run = point?.offsetNode.parentElement?.closest("[data-source-text]");
        const runStart = Number(run?.getAttribute("data-source-text"));
        if (
            point &&
            run &&
            point.offsetNode.nodeType === Node.TEXT_NODE &&
            Number.isFinite(runStart)
        ) {
            const line = point.getClientRect();
            editStart({
                offset: Math.min(runStart + point.offset, snapshot.text.length),
                ...(line ? { top: line.top - bodyTop } : {}),
            });
            return;
        }
        // Otherwise the start of the block clicked, or the end of the text.
        const block = target?.closest("[data-source-offset]");
        const offset = Number(block?.getAttribute("data-source-offset"));
        if (block === null || block === undefined || !Number.isFinite(offset)) {
            editStart({ offset: snapshot.text.length });
            return;
        }
        editStart({ offset, top: block.getBoundingClientRect().top - bodyTop });
    };
    /** Puts the caret where the reader asked for it, once the text has opened. */
    const textareaAttach = (element: HTMLTextAreaElement | null) => {
        textarea.current = element;
        const caret = caretPending.current;
        if (element === null || caret === undefined) return;
        caretPending.current = undefined;
        element.focus({ preventScroll: true });
        element.setSelectionRange(caret.offset, caret.offset);
        remember(element);
        const viewport = element.closest<HTMLElement>(
            ".happy-agent-document-surface__scroll-viewport",
        );
        if (viewport === null || caret.top === undefined) return;
        const textareaTop =
            element.getBoundingClientRect().top -
            viewport.getBoundingClientRect().top +
            viewport.scrollTop;
        viewport.scrollTop = textareaTop + caretLineTop(element, caret.offset) - caret.top;
    };
    const ready = snapshot.status === "ready";
    const saveState = snapshot.failure
        ? "Not saved"
        : snapshot.saving
          ? "Saving…"
          : snapshot.editing
            ? "Saved"
            : undefined;
    const actions = ready ? (
        <>
            {saveState === undefined ? null : (
                <span
                    className="happy-agent-document-surface__save"
                    data-state={snapshot.failure ? "failed" : snapshot.saving ? "saving" : "saved"}
                    data-testid="happy-agent-document-save"
                    title={snapshot.failure?.message}
                >
                    {saveState}
                </span>
            )}
            {snapshot.editing ? (
                <Button
                    data-testid="happy-agent-document-done"
                    icon="check"
                    onClick={props.onEditEnd}
                    size="small"
                    variant="secondary"
                >
                    Done
                </Button>
            ) : (
                <Button
                    data-testid="happy-agent-document-edit"
                    icon="edit"
                    onClick={() => editStart({ offset: 0 })}
                    size="small"
                    variant="ghost"
                >
                    Edit
                </Button>
            )}
        </>
    ) : undefined;
    const body = () => {
        if (snapshot.status === "missing")
            return (
                <div className="happy-agent-document-surface__missing">
                    <EmptyState
                        description="It may belong to a Happy Agent this one can’t reach."
                        icon="doc"
                        size="panel"
                        title="This document isn’t here"
                    />
                </div>
            );
        if (!ready) return <div className="happy-agent-document-surface__reading" />;
        if (snapshot.editing)
            return (
                <ScrollArea
                    className="happy-agent-document-surface__scroll"
                    viewportClassName="happy-agent-document-surface__scroll-viewport"
                >
                    <div className="happy-agent-document-surface__writing">
                        <textarea
                            aria-label="Document text"
                            className="happy-agent-document-surface__text"
                            data-testid="happy-agent-document-text"
                            maxLength={HAPPY_AGENT_SURFACE_DOCUMENT_TEXT_LIMIT}
                            onChange={(event) => {
                                remember(event.currentTarget);
                                props.onTextChange(event.currentTarget.value);
                            }}
                            onKeyDown={(event) => {
                                if (
                                    event.key === "Escape" ||
                                    (event.key === "Enter" && (event.metaKey || event.ctrlKey))
                                ) {
                                    event.preventDefault();
                                    props.onEditEnd();
                                }
                            }}
                            onSelect={(event) => remember(event.currentTarget)}
                            placeholder="Write in Markdown"
                            ref={textareaAttach}
                            spellCheck
                            value={snapshot.text}
                        />
                    </div>
                </ScrollArea>
            );
        if (snapshot.text.trim().length === 0)
            return (
                <div className="happy-agent-document-surface__reading">
                    <button
                        className="happy-agent-document-surface__blank"
                        data-testid="happy-agent-document-blank"
                        onClick={() => editStart({ offset: 0 })}
                        type="button"
                    >
                        Nothing written yet. Click to write.
                    </button>
                </div>
            );
        return (
            <div
                className="happy-agent-document-surface__reading"
                data-testid="happy-agent-document-reading"
                onClick={readClick}
                onKeyDown={(event) => {
                    // From the keyboard, Enter on the document (not on a link
                    // in it) opens it for writing at the start, as Edit does.
                    if (event.key !== "Enter" || event.defaultPrevented) return;
                    if (event.target instanceof Element && event.target.closest("a, button"))
                        return;
                    event.preventDefault();
                    editStart({ offset: 0 });
                }}
            >
                <MarkdownDocument sourceOffsets text={snapshot.text} />
            </div>
        );
    };
    return (
        <div
            className={["happy-agent-document-surface", props.className].filter(Boolean).join(" ")}
            data-editing={snapshot.editing ? "" : undefined}
            data-happy-desktop-ui="happy-agent-document-surface"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <HappyAgentSurfaceHeader actions={actions} surface={props.surface} />
            {snapshot.conflict ? (
                <div
                    className="happy-agent-document-surface__conflict"
                    data-testid="happy-agent-document-conflict"
                    role="status"
                >
                    <span className="happy-agent-document-surface__conflict-text">
                        Someone changed the same lines while you were writing. Your text was kept;
                        theirs is still among this document’s versions.
                    </span>
                    <Button
                        aria-label="Dismiss"
                        icon="close"
                        iconOnly
                        onClick={props.onConflictDismiss}
                        size="small"
                        variant="ghost"
                    />
                </div>
            ) : null}
            {body()}
        </div>
    );
}
