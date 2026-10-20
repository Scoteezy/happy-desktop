import { Activity, memo, useCallback, type ReactNode } from "react";

export type RetainedView = {
    readonly id: string;
    readonly content: ReactNode;
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
 * window; and it re-renders only at idle priority. Its DOM, including where
 * each scrollport was scrolled to, is left exactly as it was. A view given
 * out of sight before it was ever shown is only built once the page is idle.
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
                <Activity key={view.id} mode={view.id === props.activeId ? "visible" : "hidden"}>
                    <RetainedViewFrame id={view.id} onHide={props.onViewHide}>
                        {view.content}
                    </RetainedViewFrame>
                </Activity>
            ))}
        </>
    );
}

/*
 * Memoized for a performance contract: a hidden view's owner hands back the
 * same content element while nothing in it changed, and this frame is what
 * lets React stop there instead of walking a hidden transcript at idle
 * priority on every render of the surface around it.
 */
const RetainedViewFrame = memo(function RetainedViewFrame(props: {
    id: string;
    onHide: RetainedViewsProps["onViewHide"];
    children: ReactNode;
}) {
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
            {props.children}
        </div>
    );
});
