import { useCallback, useId, useRef, useState, type CSSProperties } from "react";
import { Icon } from "./Icon";
import { ScrollArea } from "./Scrollbar";

/** One circle of the stories row. */
export interface StoriesRowAuthor {
    /** Stable for the author across updates; the row keys its circles by it. */
    readonly id: string;
    /** The first name shown under the circle. */
    readonly name: string;
    readonly photoUrl?: string;
    /** Placeholder drawn while the photo loads, or in place of one. */
    readonly placeholderUrl?: string;
    readonly initials: string;
    /** The caller's own circle, first, while they have stories up. */
    readonly self: boolean;
    /** `unseen` is a coloured ring, `seen` a thin grey one. */
    readonly ring: "unseen" | "seen";
    /** One ring segment per story: how many there are, and how many are unseen. */
    readonly stories?: { readonly total: number; readonly unseen: number };
}

export interface StoriesRowProps {
    readonly authors: readonly StoriesRowAuthor[];
    /** Folded into the compact strip of overlapping photos. */
    readonly collapsed: boolean;
    /** A circle was pressed. */
    onAuthorOpen(authorId: string): void;
    /** The fold control was pressed. */
    onCollapse(): void;
    /** The folded strip was pressed. */
    onExpand(): void;
    readonly className?: string;
    readonly "data-testid"?: string;
}

/*
 * The geometry is the iOS row's, which is Telegram's: a 52px photo, a ring on
 * one centre line 29.495px from the photo's centre, 2.33px wide while unseen
 * and 1.33px once seen, one segment per story with 4px between them, and
 * 74px from one author to the next.
 */
const PITCH = 74;
const RING_BOX = 62;
const RING_RADIUS = 29.495;
const RING_UNSEEN = 2.33;
const RING_SEEN = 1.33;
const SEGMENT_GAP = 4;
const MAX_SEGMENTS = 30;
const PHOTO = 52;
/** The centre of a circle's photo in the list, before it is placed: 7px in plus 35, 8px down plus 34. */
const PHOTO_CENTER_X = 42;
const PHOTO_CENTER_Y = 42;
/*
 * Folded, up to three photos overlap in a 40px strip, Telegram's folded
 * title: 24px each, 14px apart, from 12px in.
 */
const COMPACT_HEIGHT = 40;
const COMPACT_SIZE = 24;
const COMPACT_PITCH = 14;
const COMPACT_INSET = 12;
const COMPACT_COUNT = 3;

interface Placed {
    readonly key: string;
    readonly author: StoriesRowAuthor;
    readonly index: number;
    /** Its place in the folded strip when it left, so it fades out where it stood. */
    readonly compact?: number;
}

/** The author's ring: segments clockwise from the top, seen ones first. */
function Ring(props: { readonly author: StoriesRowAuthor; readonly gradientId: string }) {
    const { author } = props;
    const total = Math.max(1, Math.min(MAX_SEGMENTS, author.stories?.total ?? 1));
    // The person's own ring is always drawn seen.
    const unseen =
        author.self || author.ring !== "unseen"
            ? 0
            : Math.max(1, Math.min(total, author.stories?.unseen ?? total));
    const circumference = 2 * Math.PI * RING_RADIUS;
    const length = total === 1 ? circumference : circumference / total - SEGMENT_GAP;
    const center = RING_BOX / 2;
    return (
        <svg
            aria-hidden="true"
            className="happy-stories-row__ring"
            height={RING_BOX}
            viewBox={`0 0 ${String(RING_BOX)} ${String(RING_BOX)}`}
            width={RING_BOX}
        >
            {Array.from({ length: total }, (_, index) => {
                const isUnseen = index >= total - unseen;
                return (
                    <circle
                        cx={center}
                        cy={center}
                        fill="none"
                        key={index}
                        r={RING_RADIUS}
                        stroke={isUnseen ? `url(#${props.gradientId})` : "var(--story-ring-seen)"}
                        strokeDasharray={
                            total === 1
                                ? undefined
                                : `${String(length)} ${String(circumference - length)}`
                        }
                        // From the top, clockwise, with a gap centred where two segments meet.
                        strokeDashoffset={
                            total === 1
                                ? undefined
                                : -(index * (length + SEGMENT_GAP) + SEGMENT_GAP / 2)
                        }
                        strokeLinecap="round"
                        strokeWidth={isUnseen ? RING_UNSEEN : RING_SEEN}
                        transform={`rotate(-90 ${String(center)} ${String(center)})`}
                    />
                );
            })}
        </svg>
    );
}

function sameAuthors(a: readonly StoriesRowAuthor[], b: readonly StoriesRowAuthor[]): boolean {
    return a.length === b.length && a.every((author, index) => author.id === b[index]?.id);
}

/**
 * The authors the folded strip shows, as Telegram picks them: those with
 * something new first, in the row's order, then the rest; the person's own
 * only when it is new to them, which it never is.
 */
function compactSlots(authors: readonly StoriesRowAuthor[]): ReadonlyMap<string, number> {
    const others = authors.filter((author) => !author.self);
    const picked = [
        ...others.filter((author) => author.ring === "unseen"),
        ...others.filter((author) => author.ring !== "unseen"),
    ].slice(0, COMPACT_COUNT);
    // With only the person's own stories up, the strip shows theirs.
    const shown = picked.length > 0 ? picked : authors.slice(0, 1);
    return new Map(shown.map((author, slot) => [author.id, slot]));
}

/** Where a circle stands: its slot in the open row, or its place in the folded strip. */
function placement(index: number, compact: number | undefined, collapsed: boolean): CSSProperties {
    if (!collapsed) return { translate: `${String(index * PITCH)}px 0`, scale: "1" };
    // The photo's centre, in the list, is at PHOTO_CENTER; in the strip it is
    // at its slot. A circle the strip leaves out shrinks behind its first photo.
    const slot = compact ?? 0;
    const x = COMPACT_INSET + COMPACT_SIZE / 2 + slot * COMPACT_PITCH - PHOTO_CENTER_X;
    const y = COMPACT_HEIGHT / 2 - PHOTO_CENTER_Y;
    return {
        translate: `${String(x)}px ${String(y)}px`,
        scale: String(COMPACT_SIZE / PHOTO),
        zIndex: compact === undefined ? 0 : COMPACT_COUNT - slot,
    };
}

/**
 * The stories row at the top of the sidebar, in the daemon's order. Open, it
 * is Telegram's row of circles; folded, its first three photos overlap in a
 * strip a few pixels tall, as Telegram folds its stories into the title. The
 * circles themselves shrink into the strip and grow back out of it, and the
 * band's height glides with them, so nothing under it jumps.
 *
 * Each circle stands at its slot by translation and is keyed by its author;
 * the DOM keeps the order circles first appeared in, as ReorderingList does:
 * a circle that arrives fades in where it belongs, one whose stories expired
 * fades out where it stood and takes no more presses, and when the order
 * changes the others glide once to their new slots. A circle that comes back
 * while fading out, or leaves while fading in, turns around from the opacity
 * it has.
 */
export function StoriesRow(props: StoriesRowProps) {
    const gradientId = `${useId().replace(/[^a-zA-Z0-9_-]/gu, "")}-ring`;
    const collapsed = props.collapsed;
    const [processed, setProcessed] = useState(props.authors);
    /** Keys in the order their circles first appeared; a new order moves no node. */
    const [order, setOrder] = useState<readonly string[]>(() =>
        props.authors.map((author) => author.id),
    );
    /** Authors already drawn: only the others fade in. */
    const [shown, setShown] = useState<ReadonlySet<string>>(
        () => new Set(props.authors.map((author) => author.id)),
    );
    const [leaving, setLeaving] = useState<ReadonlyMap<string, Placed>>(() => new Map());
    // Derived during render from the authors last arranged, so it never trails
    // them; a notification that keeps every author in place arranges nothing.
    if (processed !== props.authors && !sameAuthors(processed, props.authors)) {
        const keys = new Set(props.authors.map((author) => author.id));
        const next = new Map([...leaving].filter(([key]) => !keys.has(key)));
        const was = compactSlots(processed);
        /** Circles the folded strip already hid: nothing to fade, so they go at once. */
        const unseenGone = new Set<string>();
        processed.forEach((author, index) => {
            if (keys.has(author.id)) return;
            const compact = was.get(author.id);
            if (props.collapsed && compact === undefined) unseenGone.add(author.id);
            else next.set(author.id, { key: author.id, author, index, compact });
        });
        setLeaving(next);
        const known = new Set(order);
        const added = props.authors.filter((author) => !known.has(author.id));
        if (added.length > 0 || unseenGone.size > 0)
            setOrder([
                ...order.filter((key) => !unseenGone.has(key)),
                ...added.map((author) => author.id),
            ]);
        if (unseenGone.size > 0)
            setShown(new Set([...shown].filter((key) => !unseenGone.has(key))));
        setProcessed(props.authors);
    }

    const current = new Map(
        props.authors.map((author, index) => [author.id, { key: author.id, author, index }]),
    );
    const rows = order.flatMap((key) => {
        const live = current.get(key);
        if (live) return [{ ...live, exiting: false }];
        const gone = leaving.get(key);
        return gone ? [{ ...gone, exiting: true }] : [];
    });
    // A circle fading out at the end keeps its room, so the scroll never jumps.
    const slots = Math.max(
        props.authors.length,
        ...[...leaving.values()].map((row) => row.index + 1),
    );
    const forget = (key: string): void => {
        setLeaving((held) => {
            const next = new Map(held);
            next.delete(key);
            return next;
        });
        setOrder((keys) => keys.filter((each) => each !== key));
        setShown((keys) => {
            if (!keys.has(key)) return keys;
            const next = new Set(keys);
            next.delete(key);
            return next;
        });
    };
    // Folding scrolls the row back to its start alongside the circles' glide,
    // so the strip gathers from the first author whatever was scrolled into view.
    const listRef = useCallback(
        (list: HTMLUListElement | null) => {
            if (list && collapsed) list.parentElement?.scrollTo({ left: 0, behavior: "smooth" });
        },
        [collapsed],
    );
    /**
     * Folding or unfolding from the keyboard hands focus to the control that
     * replaces the one pressed, once the new state has rendered and enabled it.
     */
    const focusAfterToggle = useRef(false);
    const rootRef = useCallback(
        (root: HTMLDivElement | null) => {
            if (!root || !focusAfterToggle.current) return;
            focusAfterToggle.current = false;
            root.querySelector<HTMLElement>(
                collapsed
                    ? ".happy-stories-row__unfold"
                    : '[data-slot="0"] .happy-stories-row__author',
            )?.focus();
        },
        [collapsed],
    );
    const unseen = props.authors.filter((author) => author.ring === "unseen").length;
    const compact = compactSlots(props.authors);
    const empty = props.authors.length === 0 && leaving.size === 0;

    return (
        <div
            className={["happy-stories-row", props.className].filter(Boolean).join(" ")}
            data-collapsed={collapsed ? "" : undefined}
            data-empty={empty ? "" : undefined}
            data-happy-desktop-ui="stories-row"
            data-testid={props["data-testid"]}
            ref={rootRef}
        >
            <ScrollArea
                axes="horizontal"
                className="happy-stories-row__scroll"
                viewportClassName="happy-stories-row__viewport"
                viewportProps={{
                    // A mouse wheel only scrolls up and down; here that means along the row.
                    onWheel: (event) => {
                        if (collapsed || Math.abs(event.deltaX) > 0 || event.deltaY === 0) return;
                        event.currentTarget.scrollLeft += event.deltaY;
                    },
                }}
            >
                {/* One gradient for every unseen segment: each paints it across its own ring. */}
                <svg aria-hidden="true" className="happy-stories-row__defs" height="0" width="0">
                    <defs>
                        {/* The segments are turned a quarter left so they start at the top;
                            their x axis points up, so top to bottom runs along it backwards. */}
                        <linearGradient id={gradientId} x1="1" x2="0" y1="0" y2="0">
                            <stop className="happy-stories-row__ring-top" offset="0" />
                            <stop className="happy-stories-row__ring-bottom" offset="1" />
                        </linearGradient>
                    </defs>
                </svg>
                <ul
                    aria-hidden={collapsed ? true : undefined}
                    aria-label="Stories"
                    className="happy-stories-row__list"
                    // The circles are in the DOM in the order they appeared, not by
                    // slot, so the arrow keys walk them in the order they are seen.
                    onKeyDown={(event) => {
                        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                        const from = (event.target as Element).closest<HTMLElement>("[data-slot]");
                        if (!from) return;
                        const slot =
                            Number(from.dataset["slot"]) + (event.key === "ArrowRight" ? 1 : -1);
                        const to = event.currentTarget.querySelector<HTMLElement>(
                            `[data-slot="${String(slot)}"] .happy-stories-row__author`,
                        );
                        if (!to) return;
                        event.preventDefault();
                        to.focus();
                        to.scrollIntoView({ block: "nearest", inline: "nearest" });
                    }}
                    ref={listRef}
                    style={{ width: slots * PITCH }}
                >
                    {rows.map(({ key, author, index, exiting }) => (
                        <li
                            aria-hidden={exiting ? true : undefined}
                            className="happy-stories-row__item"
                            data-entering={!exiting && !shown.has(key) ? "" : undefined}
                            data-exiting={exiting ? "" : undefined}
                            data-hidden={collapsed && !compact.has(key) ? "" : undefined}
                            data-slot={exiting ? undefined : index}
                            key={key}
                            onTransitionEnd={(event) => {
                                if (event.target !== event.currentTarget) return;
                                if (event.propertyName !== "opacity") return;
                                // Several fades may end in one frame: each takes only its own row.
                                if (exiting) forget(key);
                                else
                                    setShown((keys) =>
                                        keys.has(key) ? keys : new Set(keys).add(key),
                                    );
                            }}
                            style={placement(
                                index,
                                exiting ? leaving.get(key)?.compact : compact.get(key),
                                collapsed,
                            )}
                        >
                            <button
                                aria-label={
                                    author.self
                                        ? "Your story"
                                        : `${author.name}'s story${author.ring === "unseen" ? ", unseen" : ""}`
                                }
                                className="happy-stories-row__author"
                                data-happy-desktop-ui="stories-row-author"
                                data-ring={author.ring}
                                data-self={author.self ? "" : undefined}
                                disabled={exiting || collapsed}
                                onClick={() => props.onAuthorOpen(author.id)}
                                // One stop for Tab; the arrow keys move along the row.
                                tabIndex={index === 0 ? 0 : -1}
                                type="button"
                            >
                                <span className="happy-stories-row__photo" aria-hidden="true">
                                    {(author.photoUrl ?? author.placeholderUrl) ? (
                                        <img
                                            alt=""
                                            draggable={false}
                                            src={author.photoUrl ?? author.placeholderUrl}
                                            style={
                                                author.placeholderUrl
                                                    ? {
                                                          backgroundImage: `url(${author.placeholderUrl})`,
                                                      }
                                                    : undefined
                                            }
                                        />
                                    ) : (
                                        <span className="happy-stories-row__initials">
                                            {author.initials}
                                        </span>
                                    )}
                                </span>
                                <Ring author={author} gradientId={gradientId} />
                                <span className="happy-stories-row__name">{author.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </ScrollArea>
            <button
                aria-hidden={collapsed || empty ? true : undefined}
                aria-label="Hide stories"
                className="happy-stories-row__fold"
                data-happy-desktop-ui="stories-row-fold"
                disabled={collapsed || empty}
                onClick={(event) => {
                    focusAfterToggle.current = event.detail === 0;
                    props.onCollapse();
                }}
                tabIndex={collapsed ? -1 : 0}
                title="Hide stories"
                type="button"
            >
                <Icon name="chevron-up" size={14} />
            </button>
            <button
                aria-hidden={collapsed && !empty ? undefined : true}
                aria-label={
                    unseen > 0
                        ? `Show stories, ${String(unseen)} with something new`
                        : "Show stories"
                }
                className="happy-stories-row__unfold"
                data-happy-desktop-ui="stories-row-unfold"
                disabled={!collapsed || empty}
                onClick={(event) => {
                    focusAfterToggle.current = event.detail === 0;
                    props.onExpand();
                }}
                tabIndex={collapsed ? 0 : -1}
                type="button"
            >
                <span
                    className="happy-stories-row__unfold-label"
                    style={{
                        // The control starts 6px in; its text follows the last photo by 8px.
                        paddingLeft:
                            COMPACT_INSET -
                            6 +
                            COMPACT_SIZE +
                            (Math.max(1, compact.size) - 1) * COMPACT_PITCH +
                            8,
                    }}
                >
                    Stories
                </span>
                <Icon name="chevron-down" size={14} />
            </button>
        </div>
    );
}
