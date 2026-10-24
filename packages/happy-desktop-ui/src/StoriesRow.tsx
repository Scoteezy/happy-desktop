import { useId, useState } from "react";
import { Icon } from "./Icon";
import { ScrollArea } from "./Scrollbar";

/** One circle of the stories row. */
export interface StoriesRowAuthor {
    /** Stable for the author across updates; the row keys its circles by it. */
    readonly id: string;
    /** The first name shown under the circle; the person's own reads "My Story". */
    readonly name: string;
    readonly photoUrl?: string;
    /** Placeholder drawn while the photo loads, or in place of one. */
    readonly placeholderUrl?: string;
    readonly initials: string;
    /** The caller's own circle, always first, with its "+" badge. */
    readonly self: boolean;
    /** `unseen` is a coloured ring, `seen` a thin grey one, `none` no ring. */
    readonly ring: "unseen" | "seen" | "none";
    /** One ring segment per story: how many there are, and how many are unseen. */
    readonly stories?: { readonly total: number; readonly unseen: number };
}

export interface StoriesRowProps {
    readonly authors: readonly StoriesRowAuthor[];
    /** A circle was pressed. */
    onAuthorOpen(authorId: string): void;
    /** The "+" on the person's own circle. */
    onCreate(): void;
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

interface Placed {
    readonly key: string;
    readonly author: StoriesRowAuthor;
    readonly index: number;
}

/** The author's ring: segments clockwise from the top, seen ones first. */
function Ring(props: { readonly author: StoriesRowAuthor; readonly gradientId: string }) {
    const { author } = props;
    if (author.ring === "none") return null;
    const total = Math.max(1, Math.min(MAX_SEGMENTS, author.stories?.total ?? 1));
    // The person's own ring is always drawn seen.
    const unseen = author.self
        ? 0
        : Math.min(total, author.stories?.unseen ?? (author.ring === "unseen" ? total : 0));
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
 * The stories row at the top of the sidebar, in the daemon's order: the
 * person's own "My Story" first, with its "+", then everyone else. It is one
 * fixed-height band whatever it holds, so the sidebar beneath it never moves.
 *
 * Each circle stands at its slot by translation and is keyed by its author;
 * the DOM keeps the order circles first appeared in, as ReorderingList does,
 * so nothing jumps: a circle that arrives fades in where it belongs, one whose
 * stories expired fades out where it stood and takes no more presses, and
 * when the order changes the others glide once to their new slots. A circle
 * that comes back while fading out, or leaves while fading in, turns around
 * from the opacity it has.
 */
export function StoriesRow(props: StoriesRowProps) {
    const gradientId = `${useId().replace(/[^a-zA-Z0-9_-]/gu, "")}-ring`;
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
        processed.forEach((author, index) => {
            if (!keys.has(author.id)) next.set(author.id, { key: author.id, author, index });
        });
        setLeaving(next);
        const known = new Set(order);
        const added = props.authors.filter((author) => !known.has(author.id));
        if (added.length > 0) setOrder([...order, ...added.map((author) => author.id)]);
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

    return (
        <ScrollArea
            axes="horizontal"
            className={["happy-stories-row", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="stories-row"
            data-testid={props["data-testid"]}
            viewportClassName="happy-stories-row__viewport"
            viewportProps={{
                // A mouse wheel only scrolls up and down; here that means along the row.
                onWheel: (event) => {
                    if (Math.abs(event.deltaX) > 0 || event.deltaY === 0) return;
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
                style={{ width: slots * PITCH }}
            >
                {rows.map(({ key, author, index, exiting }) => (
                    <li
                        aria-hidden={exiting ? true : undefined}
                        className="happy-stories-row__item"
                        data-entering={!exiting && !shown.has(key) ? "" : undefined}
                        data-exiting={exiting ? "" : undefined}
                        data-slot={exiting ? undefined : index}
                        key={key}
                        onTransitionEnd={(event) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.propertyName !== "opacity") return;
                            // Several fades may end in one frame: each takes only its own row.
                            if (exiting) forget(key);
                            else
                                setShown((keys) => (keys.has(key) ? keys : new Set(keys).add(key)));
                        }}
                        style={{ translate: `${String(index * PITCH)}px 0` }}
                    >
                        <button
                            aria-label={
                                author.self
                                    ? author.ring === "none"
                                        ? "Add to your story"
                                        : "Your story"
                                    : `${author.name}'s story${author.ring === "unseen" ? ", unseen" : ""}`
                            }
                            className="happy-stories-row__author"
                            data-happy-desktop-ui="stories-row-author"
                            data-ring={author.ring}
                            data-self={author.self ? "" : undefined}
                            disabled={exiting}
                            // One stop for Tab; the arrow keys move along the row.
                            tabIndex={index === 0 ? 0 : -1}
                            onClick={() =>
                                author.self && author.ring === "none"
                                    ? props.onCreate()
                                    : props.onAuthorOpen(author.id)
                            }
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
                            <span className="happy-stories-row__name">
                                {author.self ? "My Story" : author.name}
                            </span>
                        </button>
                        {author.self ? (
                            <button
                                aria-label="New story"
                                className="happy-stories-row__add"
                                data-happy-desktop-ui="stories-row-add"
                                disabled={exiting}
                                onClick={props.onCreate}
                                title="New story"
                                type="button"
                            >
                                <Icon name="plus" size={12} />
                            </button>
                        ) : null}
                    </li>
                ))}
            </ul>
        </ScrollArea>
    );
}
