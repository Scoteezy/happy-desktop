import { parseDiffFromFile, type SelectedLineRange } from "@pierre/diffs";
import { CodeView, useStableCallback, type CodeViewHandle } from "@pierre/diffs/react";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "./Button";
import { PIERRE_PANE_CSS } from "./pierreCodeSurface";
import { ReviewComment } from "./ReviewComment";
import type { ChangedFileDiffCommentSide } from "./ChangedFileDiff";

/** One changed file, as the stream needs it: both sides and where it came from. */
export type ReviewStreamFile = {
    readonly path: string;
    /** The path before a rename, when Git reports one. */
    readonly oldPath?: string;
    readonly oldContent: string;
    readonly newContent: string;
    /** Identity of each side, when the content is known to be unmodified since. */
    readonly oldCacheKey?: string;
    readonly newCacheKey?: string;
};

/** A note in the stream. Unlike one file's notes, this one says which file. */
export type ReviewStreamComment = {
    readonly id: string;
    readonly path: string;
    readonly lineNumber: number;
    readonly side: ChangedFileDiffCommentSide;
    readonly text: string;
    readonly stale?: boolean;
};

export type ReviewStreamCommentDraft = {
    readonly path: string;
    readonly lineNumber: number;
    readonly side: ChangedFileDiffCommentSide;
    readonly text: string;
};

export type ReviewStreamProps = {
    appearance: "dark" | "light";
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /**
     * Every changed file, in the order the review should read them. The stream
     * renders one scroll for all of them rather than one pane per file, so a
     * change that spans four files is read the way it was made.
     */
    files: readonly ReviewStreamFile[];
    /** Whether long lines wrap to the pane instead of scrolling out of it. */
    wrap?: boolean;
    onWrapChange?: (wrap: boolean) => void;
    /** Notes already written, and the one being written. */
    comments?: readonly ReviewStreamComment[];
    commentDraft?: ReviewStreamCommentDraft;
    onCommentDraftOpen?: (
        path: string,
        lineNumber: number,
        side: ChangedFileDiffCommentSide,
    ) => void;
    onCommentDraftUpdate?: (text: string) => void;
    onCommentDraftCancel?: () => void;
    onCommentDraftSubmit?: () => void;
    onCommentRemove?: (commentId: string) => void;
    commentAuthorInitials?: string;
    commentAuthorName?: string;
    /** How many notes are waiting, and what hands them to the agent. */
    commentTotal?: number;
    onCommentsSubmit?: () => void;
};

/** What one annotation carries, handed back by the renderer verbatim. */
type ReviewStreamAnnotation =
    | { readonly type: "comment"; readonly comment: ReviewStreamComment }
    | { readonly type: "draft" };

/**
 * One stop on the walk through a review: a hunk, and the file it is in. The
 * addresses come from the parsed diff, which is authoritative about where its
 * own hunks begin, so travelling to one does not depend on it having been
 * drawn yet.
 */
type ReviewStreamStop = {
    readonly id: string;
    readonly lineNumber: number;
    readonly side: ChangedFileDiffCommentSide;
};

/**
 * Every changed file in one scroll, the way a review is actually read.
 *
 * A diff per pane answers "what happened to this file"; a change is rarely
 * about one file, and reading it a pane at a time makes the reader hold the
 * order in their head. This is the same renderer, given all the files at once
 * and asked to virtualize them, plus the two steps that travel between the
 * changes themselves rather than between scroll positions.
 */
export function ReviewStream(props: ReviewStreamProps) {
    const view = useRef<CodeViewHandle<ReviewStreamAnnotation>>(null);
    const commenting = props.onCommentDraftOpen !== undefined;

    const items = useMemo(
        () =>
            props.files.map((file) => ({
                id: file.path,
                type: "diff" as const,
                fileDiff: parseDiffFromFile(
                    {
                        name: file.oldPath ?? file.path,
                        contents: file.oldContent,
                        ...(file.oldCacheKey === undefined ? {} : { cacheKey: file.oldCacheKey }),
                    },
                    {
                        name: file.path,
                        contents: file.newContent,
                        ...(file.newCacheKey === undefined ? {} : { cacheKey: file.newCacheKey }),
                    },
                ),
            })),
        [props.files],
    );

    // Where the notes go, per file. Only positions live here, never the text
    // being typed: the renderer re-places annotations whenever this changes, so
    // carrying the draft's characters would redraw them on every keystroke.
    const draftPath = props.commentDraft?.path;
    const draftLine = props.commentDraft?.lineNumber;
    const draftSide = props.commentDraft?.side;
    const annotated = useMemo(() => {
        if (!commenting) return items;
        return items.map((item) => {
            const held = (props.comments ?? [])
                .filter((comment) => comment.path === item.id)
                .map((comment) => ({
                    side: comment.side,
                    lineNumber: comment.lineNumber,
                    metadata: { type: "comment" as const, comment },
                }));
            const annotations =
                draftPath === item.id && draftLine !== undefined && draftSide !== undefined
                    ? [
                          ...held,
                          {
                              side: draftSide,
                              lineNumber: draftLine,
                              metadata: { type: "draft" as const },
                          },
                      ]
                    : held;
            if (annotations.length === 0) return item;
            // The renderer is controlled: it keeps what it last drew for an item
            // unless the item says it changed. Only the addresses can change
            // here — a note's characters are read where it is drawn — so the
            // version is those addresses and nothing else.
            const version = annotations.reduce(
                (carried, annotation) =>
                    carried * 31 +
                    annotation.lineNumber * 2 +
                    (annotation.side === "additions" ? 1 : 0),
                annotations.length,
            );
            return { ...item, annotations, version };
        });
    }, [commenting, draftLine, draftPath, draftSide, items, props.comments]);

    // Every hunk in the review, in reading order. The parsed diff knows where
    // its hunks begin, so this is read from it rather than from whichever rows
    // happen to be on screen — which is what lets a stop far below the drawn
    // window still be somewhere to go.
    const stops = useMemo<ReviewStreamStop[]>(
        () =>
            items.flatMap((item) =>
                item.fileDiff.hunks.map((hunk) =>
                    hunk.additionCount > 0
                        ? {
                              id: item.id,
                              lineNumber: hunk.additionStart,
                              side: "additions" as const,
                          }
                        : {
                              id: item.id,
                              lineNumber: hunk.deletionStart,
                              side: "deletions" as const,
                          },
                ),
            ),
        [items],
    );
    // Which stop the reader is on. The walk is a sequence, so where the last
    // step landed is the only thing that says what "next" means; nothing else
    // on screen reports it.
    const [stopAt, stopAtSet] = useState(-1);
    const stopGo = (direction: -1 | 1): void => {
        if (stops.length === 0) return;
        const next = Math.min(Math.max(stopAt + direction, 0), stops.length - 1);
        const stop = stops[next];
        if (stop === undefined) return;
        stopAtSet(next);
        view.current?.scrollTo({
            type: "line",
            id: stop.id,
            lineNumber: stop.lineNumber,
            side: stop.side,
            align: "start",
            behavior: "smooth",
        });
    };

    // The renderer reports where its button was pressed as a one-line selection,
    // and hands back the item it belongs to — which is the file, because the
    // stream's item ids are paths.
    const gutterUtilityClicked = useStableCallback(
        (range: SelectedLineRange, context: { item: { id: string } }) => {
            props.onCommentDraftOpen?.(context.item.id, range.start, range.side ?? "additions");
        },
    );
    const options = useMemo(
        () => ({
            diffIndicators: "bars" as const,
            diffStyle: "unified" as const,
            hunkSeparators: "line-info-basic" as const,
            lineHoverHighlight: "both" as const,
            lineDiffType: "word-alt" as const,
            overflow: props.wrap === true ? ("wrap" as const) : ("scroll" as const),
            stickyHeader: true,
            theme: { dark: "pierre-dark" as const, light: "pierre-light" as const },
            themeType: props.appearance,
            unsafeCSS: PIERRE_PANE_CSS,
            enableGutterUtility: commenting,
            onGutterUtilityClick: gutterUtilityClicked,
        }),
        [commenting, gutterUtilityClicked, props.appearance, props.wrap],
    );

    const author = {
        authorInitials: props.commentAuthorInitials ?? "Y",
        authorName: props.commentAuthorName ?? "You",
    };

    return (
        <section
            aria-label="Changes in this workspace"
            className={["happy-review-stream", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="review-stream"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <div className="happy-review-stream__bar" data-happy-desktop-ui="review-stream-bar">
                <span className="happy-review-stream__count">
                    {props.files.length === 1
                        ? "1 changed file"
                        : `${String(props.files.length)} changed files`}
                </span>
                <span className="happy-review-stream__bar-end">
                    {props.onCommentsSubmit && (props.commentTotal ?? 0) > 0 ? (
                        <Button
                            data-testid="review-stream-request"
                            onClick={() => props.onCommentsSubmit?.()}
                            size="small"
                            variant="secondary"
                        >
                            {`Request changes (${String(props.commentTotal ?? 0)})`}
                        </Button>
                    ) : null}
                    <span className="happy-review-stream__steps">
                        <Button
                            aria-label="Previous change"
                            data-testid="review-stream-previous-change"
                            icon="chevron-up"
                            iconOnly
                            onClick={() => stopGo(-1)}
                            size="small"
                            variant="ghost"
                        />
                        <Button
                            aria-label="Next change"
                            data-testid="review-stream-next-change"
                            icon="chevron-down"
                            iconOnly
                            onClick={() => stopGo(1)}
                            size="small"
                            variant="ghost"
                        />
                    </span>
                    {props.onWrapChange === undefined ? null : (
                        <Button
                            data-testid="review-stream-wrap"
                            onClick={() => props.onWrapChange?.(props.wrap !== true)}
                            size="small"
                            variant="ghost"
                        >
                            {props.wrap === true ? "Wrap" : "No wrap"}
                        </Button>
                    )}
                </span>
            </div>

            <CodeView<ReviewStreamAnnotation>
                className="happy-review-stream__renderer happy-diff-surface"
                items={annotated}
                options={options}
                ref={view}
                {...(commenting
                    ? {
                          renderAnnotation: (annotation) => {
                              const held = annotation.metadata;
                              // The draft's characters are read here rather than
                              // carried through the annotation, so typing one
                              // redraws this note and nothing else.
                              if (held.type === "draft")
                                  return props.commentDraft === undefined ? null : (
                                      <ReviewComment
                                          {...author}
                                          draft={props.commentDraft.text}
                                          lineNumber={props.commentDraft.lineNumber}
                                          onCancel={() => props.onCommentDraftCancel?.()}
                                          onDraftChange={(text) =>
                                              props.onCommentDraftUpdate?.(text)
                                          }
                                          onSubmit={() => props.onCommentDraftSubmit?.()}
                                          side={props.commentDraft.side}
                                      />
                                  );
                              return (
                                  <ReviewComment
                                      {...author}
                                      lineNumber={held.comment.lineNumber}
                                      onRemove={() => props.onCommentRemove?.(held.comment.id)}
                                      side={held.comment.side}
                                      stale={held.comment.stale}
                                      text={held.comment.text}
                                  />
                              );
                          },
                      }
                    : {})}
            />
        </section>
    );
}
