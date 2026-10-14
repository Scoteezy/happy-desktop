import {
    useRef,
    useState,
    type AnimationEvent,
    type CSSProperties,
    type KeyboardEvent,
    type MouseEvent,
    type PointerEvent,
    type ReactNode,
} from "react";
import { haptic } from "./haptics";

/** Pointer travel, in px, before a press becomes a drag instead of a click. The sidebar's own. */
const DRAG_THRESHOLD = 4;
/** How close to a scrollport's edge, in px, the pointer must be for a drag to scroll it. */
const EDGE_ZONE = 48;
/** The most a drag scrolls in one frame, at the very edge. */
const EDGE_SPEED = 14;

/**
 * Marks an element inside a row whose pointer presses are its own: a control,
 * a field being edited. A press that starts there is never a drag.
 */
export const REORDERING_LIST_STATIC = { "data-reordering-list-static": "" } as const;

export type ReorderingListProps<Item> = {
    items: readonly Item[];
    /** The stable identity of an item. Rows are keyed by it and never by position. */
    itemKey: (item: Item) => string;
    renderItem: (item: Item) => ReactNode;
    /** Every row is this tall; rows sit at `index × (itemHeight + gap)`. */
    itemHeight: number;
    gap: number;
    /**
     * Makes the rows draggable among themselves and reports each slot a drag
     * crosses, as it crosses it, not only where it is dropped. The owner moves
     * the item in `items` and the other rows glide out of its way. Without it
     * nothing in the list can be dragged.
     */
    onMove?: (key: string, toIndex: number) => void;
    /** Below the rows, never dragged and never a drop target; it follows the list's height. */
    footer?: ReactNode;
    "aria-label"?: string;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

interface RenderingRow<Item> {
    readonly key: string;
    readonly item: Item;
    readonly index: number;
    /** Set on a row that arrived after the list was first drawn, so it fades in. */
    readonly entering: boolean;
}

interface ExitingRow<Item> {
    readonly key: string;
    readonly item: Item;
    /** The slot it stood in when it left, where it fades out. */
    readonly index: number;
}

interface Drag {
    readonly key: string;
    /** Where the held row's top edge is, in px from the top of the rows. */
    readonly offset: number;
}

interface Press {
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly key: string;
    /** How far below the row's top edge the pointer took hold of it. */
    readonly grab: number;
    active: boolean;
    lastIndex: number;
    clientY: number;
}

/** The nearest ancestor that scrolls vertically, which a drag near its edge scrolls. */
function scrollParentOf(element: HTMLElement): HTMLElement | undefined {
    for (let node = element.parentElement; node; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowY;
        if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight)
            return node;
    }
    return undefined;
}

/**
 * ReorderingList — a list of fixed-height rows that can be dragged into a new
 * order, after happy-list's own.
 *
 * Every row is absolutely placed at its slot and keyed by its item, and the
 * rows are rendered in the order they arrived: a new item is appended, and a
 * removed one fades out where it stood. Nothing about the DOM order changes
 * while a row is being dragged; only each row's translation and stacking do.
 *
 * A drag starts when a press on a row travels 4px, the same threshold the
 * sidebar uses, and never from inside an element marked
 * `REORDERING_LIST_STATIC`. The held row follows the pointer, lifts to 1.05,
 * and stays clamped to the list; the slot under its top edge, rounded, is its
 * target, and every new target is reported through `onMove` as it is crossed.
 * The other rows glide to their new slots and ignore the pointer until the
 * drag ends. A press that never travels is an ordinary click. Alt+Up and
 * Alt+Down move the focused row one slot.
 */
export function ReorderingList<Item>(props: ReorderingListProps<Item>) {
    const pitch = props.itemHeight + props.gap;
    const [processed, setProcessed] = useState(props.items);
    const [rendering, setRendering] = useState<readonly RenderingRow<Item>[]>(() =>
        props.items.map((item, index) => ({
            key: props.itemKey(item),
            item,
            index,
            entering: false,
        })),
    );
    const [exiting, setExiting] = useState<readonly ExitingRow<Item>[]>([]);
    const [drag, setDrag] = useState<Drag>();
    const press = useRef<Press | undefined>(undefined);
    const rows = useRef<HTMLDivElement | null>(null);
    const suppressClick = useRef(false);
    const frame = useRef<number | undefined>(undefined);

    // The items changed: keep every row that is still here in the order it was
    // drawn, give it its new slot, append the new ones, and let the removed
    // ones fade out where they stood. Derived during render, from the previous
    // items, so it never trails the items it describes.
    if (processed !== props.items) {
        const slots = new Map<string, number>();
        props.items.forEach((item, index) => slots.set(props.itemKey(item), index));
        const next: RenderingRow<Item>[] = [];
        const kept = new Set<string>();
        for (const row of rendering) {
            const index = slots.get(row.key);
            if (index === undefined) continue;
            kept.add(row.key);
            next.push({ ...row, item: props.items[index]!, index });
        }
        props.items.forEach((item, index) => {
            const key = props.itemKey(item);
            if (!kept.has(key)) next.push({ key, item, index, entering: true });
        });
        const leaving = rendering
            .filter((row) => !slots.has(row.key))
            .map((row) => ({ key: row.key, item: row.item, index: row.index }));
        setExiting([...exiting.filter((row) => !slots.has(row.key)), ...leaving]);
        setRendering(next);
        setProcessed(props.items);
        if (drag && !slots.has(drag.key)) setDrag(undefined);
    }

    const keys = processed.map(props.itemKey);
    const count = keys.length;
    const height = count === 0 ? 0 : count * props.itemHeight + (count - 1) * props.gap;

    const offsetAt = (clientY: number, current: Press): number => {
        const top = rows.current?.getBoundingClientRect().top ?? 0;
        return Math.max(0, Math.min((count - 1) * pitch, clientY - top - current.grab));
    };

    /** Follows the pointer, and reports the slot the held row's top edge is nearest. */
    const follow = (current: Press): void => {
        const offset = offsetAt(current.clientY, current);
        setDrag({ key: current.key, offset });
        const index = Math.max(0, Math.min(count - 1, Math.round(offset / pitch)));
        if (index === current.lastIndex) return;
        current.lastIndex = index;
        haptic("selection");
        props.onMove?.(current.key, index);
    };

    /** Scrolls the list's scrollport while the held row is near its edge. */
    const edgeScroll = (): void => {
        frame.current = undefined;
        const current = press.current;
        const node = rows.current;
        if (!current?.active || !node) return;
        const scroller = scrollParentOf(node);
        if (scroller) {
            const bounds = scroller.getBoundingClientRect();
            const above = bounds.top + EDGE_ZONE - current.clientY;
            const below = current.clientY - (bounds.bottom - EDGE_ZONE);
            const step =
                above > 0
                    ? -Math.ceil((Math.min(above, EDGE_ZONE) / EDGE_ZONE) * EDGE_SPEED)
                    : below > 0
                      ? Math.ceil((Math.min(below, EDGE_ZONE) / EDGE_ZONE) * EDGE_SPEED)
                      : 0;
            if (step !== 0) {
                const before = scroller.scrollTop;
                scroller.scrollTop = before + step;
                if (scroller.scrollTop !== before) follow(current);
            }
        }
        frame.current = requestAnimationFrame(edgeScroll);
    };

    const end = (): void => {
        const current = press.current;
        press.current = undefined;
        if (frame.current !== undefined) cancelAnimationFrame(frame.current);
        frame.current = undefined;
        if (!current?.active) return;
        if (rows.current?.hasPointerCapture(current.pointerId))
            rows.current.releasePointerCapture(current.pointerId);
        haptic("impact");
        setDrag(undefined);
    };

    const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
        if (!props.onMove || event.button !== 0 || press.current || count < 2) return;
        const target = event.target as Element;
        if (target.closest("[data-reordering-list-static]")) return;
        const row = target.closest<HTMLElement>("[data-reordering-list-row]");
        if (!row || row.dataset["exiting"] !== undefined) return;
        const top = event.currentTarget.getBoundingClientRect().top;
        const y = event.clientY - top;
        const index = Math.floor(y / pitch);
        // A press in the gap between two rows belongs to neither.
        if (index < 0 || index >= count || y - index * pitch > props.itemHeight) return;
        suppressClick.current = false;
        press.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            key: keys[index]!,
            grab: y - index * pitch,
            active: false,
            lastIndex: index,
            clientY: event.clientY,
        };
    };

    const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
        const current = press.current;
        if (!current || event.pointerId !== current.pointerId) return;
        current.clientY = event.clientY;
        if (!current.active) {
            const travel = Math.hypot(
                event.clientX - current.startX,
                event.clientY - current.startY,
            );
            if (travel < DRAG_THRESHOLD) return;
            current.active = true;
            // The click the browser fires on release belongs to the drag.
            suppressClick.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            window.getSelection()?.removeAllRanges();
            haptic("impact");
            frame.current = requestAnimationFrame(edgeScroll);
        }
        follow(current);
    };

    const onPointerEnd = (event: PointerEvent<HTMLDivElement>): void => {
        if (event.pointerId !== press.current?.pointerId) return;
        end();
    };

    const onClickCapture = (event: MouseEvent<HTMLDivElement>): void => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === "Escape" && press.current?.active) {
            event.preventDefault();
            end();
            return;
        }
        if (!props.onMove || !event.altKey) return;
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        // A field being edited keeps its own keys.
        if ((event.target as Element).closest("[data-reordering-list-static]")) return;
        const row = (event.target as Element).closest<HTMLElement>("[data-reordering-list-row]");
        const key = row?.dataset["reorderingListKey"];
        if (key === undefined || row?.dataset["exiting"] !== undefined) return;
        const from = keys.indexOf(key);
        const to = from + (event.key === "ArrowUp" ? -1 : 1);
        if (from < 0 || to < 0 || to >= count) return;
        event.preventDefault();
        haptic("selection");
        props.onMove(key, to);
    };

    const onExitEnd = (event: AnimationEvent<HTMLDivElement>, key: string): void => {
        if (event.target !== event.currentTarget) return;
        setExiting((current) => current.filter((row) => row.key !== key));
    };

    const row = (entry: RenderingRow<Item> | ExitingRow<Item>, leaving: boolean): ReactNode => {
        const held = !leaving && drag?.key === entry.key;
        const top = held ? drag.offset : entry.index * pitch;
        return (
            <div
                className="happy-reordering-list__row"
                data-entering={!leaving && "entering" in entry && entry.entering ? "" : undefined}
                data-exiting={leaving ? "" : undefined}
                data-held={held ? "" : undefined}
                data-happy-desktop-ui="reordering-list-row"
                data-reordering-list-key={entry.key}
                data-reordering-list-row=""
                key={entry.key}
                onAnimationEnd={leaving ? (event) => onExitEnd(event, entry.key) : undefined}
                role="listitem"
                style={{ height: props.itemHeight, translate: `0 ${String(top)}px` }}
            >
                {props.renderItem(entry.item)}
            </div>
        );
    };

    return (
        <div
            className={["happy-reordering-list", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="reordering-list"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {/* Rows are absolutely placed at their own slots, so a drag only translates them and never reorders the DOM. */}
            <div
                aria-label={props["aria-label"]}
                className="happy-reordering-list__rows"
                data-dragging={drag ? "" : undefined}
                data-happy-desktop-ui="reordering-list-rows"
                data-reorderable={props.onMove ? "" : undefined}
                onClickCapture={onClickCapture}
                onKeyDown={onKeyDown}
                onLostPointerCapture={onPointerEnd}
                onPointerCancel={onPointerEnd}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                ref={rows}
                role="list"
                style={{ height }}
            >
                {rendering.map((entry) => row(entry, false))}
                {exiting.map((entry) => row(entry, true))}
            </div>
            {props.footer}
        </div>
    );
}
