import { Activity, memo, useCallback, type ReactNode } from "react";
import { WindowOverlayRetainedContext } from "./WindowOverlay";

export type RetainedView = {
    readonly id: string;
    /**
     * What the view shows. Only the view on screen is drawn from it: one out
     * of sight keeps what it last drew, whatever it is given, until it is shown
     * again. A view first mounted out of sight is drawn from it once, at idle.
     */
    readonly content?: ReactNode;
};

export type RetainedViewsProps = {
    /** The view on screen. Absent keeps every view out of sight, such as while something else covers the pane. */
    activeId?: string;
    /**
     * Every view kept mounted, the one on screen included, in any order. A view
     * that leaves this list is unmounted; one that stays keeps its DOM, scroll
     * position, and component state while it is out of sight.
     */
    views: readonly RetainedView[];
    /**
     * Told how many elements a view keeps alive each time it leaves the screen,
     * so its owner can decide how many it can afford to keep. Keep its identity
     * stable: every view is measured whenever it changes.
     */
    onViewHide?: (id: string, elements: number) => void;
};

/**
 * C-300 RetainedViews — keeps recently shown views mounted out of sight, so
 * showing one again reveals what is already there instead of building it anew.
 *
 * Each view sits in its own React `Activity`. One out of sight is
 * `display: none`, so it takes no space and nothing in it can be focused,
 * clicked, typed into, found, or read by assistive technology; its effects and
 * refs are disconnected, so no listener of its own answers the keyboard or the
 * window, and no store it reads re-renders it. What it hung off the shell
 * through `WindowOverlay` — a menu, a picture viewer — leaves with it, and so
 * does the focus, wherever in the view it was. Its DOM, including where each
 * scrollport was scrolled to, is left exactly as it was.
 *
 * A view out of sight does no work at all: it is frozen as it was last drawn,
 * and whatever its owner hands it meanwhile is not rendered, not even at idle
 * priority. Showing it again draws it once from the content it is given then.
 *
 * Views are placed in the order of their ids rather than of the list, so a view
 * never moves in the DOM — moving one would lose its scroll position — whatever
 * order its owner keeps them in.
 */
export function RetainedViews(props: RetainedViewsProps) {
    const views = [...props.views].sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    );
    return (
        <>
            {views.map((view) => (
                <RetainedViewEntry
                    active={view.id === props.activeId}
                    content={view.content}
                    id={view.id}
                    key={view.id}
                    onHide={props.onViewHide}
                />
            ))}
        </>
    );
}

type RetainedViewEntryProps = {
    active: boolean;
    content: ReactNode;
    id: string;
    onHide: RetainedViewsProps["onViewHide"];
};

/*
 * Memoized for a performance contract: once a view is out of sight, renders
 * around it stop here, before a new `Activity` element would have React walk
 * the hidden subtree at idle priority. It renders again only to be shown or
 * hidden.
 */
const RetainedViewEntry = memo(
    function RetainedViewEntry(props: RetainedViewEntryProps) {
        return (
            <Activity mode={props.active ? "visible" : "hidden"}>
                <RetainedViewFrame
                    content={props.content}
                    hidden={!props.active}
                    id={props.id}
                    onHide={props.onHide}
                />
            </Activity>
        );
    },
    (previous, next) =>
        previous.active === next.active &&
        previous.id === next.id &&
        previous.onHide === next.onHide &&
        (!next.active || previous.content === next.content),
);

type RetainedViewFrameProps = {
    content: ReactNode;
    /** Freezes the frame as it was last drawn; see the comparison below. */
    hidden: boolean;
    id: string;
    onHide: RetainedViewsProps["onViewHide"];
};

/*
 * Memoized for a performance contract: a frame being hidden, or out of sight,
 * counts as unchanged whatever it is given, so React keeps the content it last
 * drew instead of drawing a hidden transcript again. Shown, it compares as
 * usual against what it last drew.
 */
const RetainedViewFrame = memo(
    function RetainedViewFrame(props: RetainedViewFrameProps) {
        const { id, onHide } = props;
        // React detaches a ref when its Activity hides, before the view is taken
        // off screen, so the cleanup is the moment the view leaves and is still
        // there to be counted. Kept stable so an ordinary render never re-measures.
        const frame = useCallback(
            (element: HTMLDivElement | null) => {
                if (!element) return;
                return () => {
                    // A control taken off screen can stay the focused element, and
                    // keys would keep going to it — and the view shown next would be
                    // refused the caret as if the reader were writing elsewhere. The
                    // focus leaves with the view.
                    const focused = element.ownerDocument.activeElement;
                    if (focused instanceof HTMLElement && element.contains(focused)) focused.blur();
                    onHide?.(id, element.getElementsByTagName("*").length);
                };
            },
            [id, onHide],
        );
        return (
            <div
                className="happy-retained-views__view"
                data-happy-desktop-ui="retained-view"
                data-view-id={id}
                ref={frame}
            >
                <WindowOverlayRetainedContext.Provider value>
                    {props.content}
                </WindowOverlayRetainedContext.Provider>
            </div>
        );
    },
    (previous, next) =>
        next.hidden ||
        (previous.hidden === next.hidden &&
            previous.content === next.content &&
            previous.id === next.id &&
            previous.onHide === next.onHide),
);
