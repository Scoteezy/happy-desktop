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

/**
 * The stories row at the top of the sidebar, in the daemon's order: the
 * person's own "My Story" first, with its "+", then everyone else. It is one
 * fixed-height band whatever it holds, so the sidebar beneath it never moves
 * when stories arrive, are seen, or expire.
 */
export function StoriesRow(props: StoriesRowProps) {
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
            <ul aria-label="Stories" className="happy-stories-row__list">
                {props.authors.map((author) => (
                    <li className="happy-stories-row__item" key={author.id}>
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
                            onClick={() =>
                                author.self && author.ring === "none"
                                    ? props.onCreate()
                                    : props.onAuthorOpen(author.id)
                            }
                            type="button"
                        >
                            <span className="happy-stories-row__ring" aria-hidden="true">
                                <span className="happy-stories-row__photo">
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
                            </span>
                            <span className="happy-stories-row__name">
                                {author.self ? "My Story" : author.name}
                            </span>
                        </button>
                        {author.self ? (
                            <button
                                aria-label="New story"
                                className="happy-stories-row__add"
                                data-happy-desktop-ui="stories-row-add"
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
