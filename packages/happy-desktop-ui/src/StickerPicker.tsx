import { happyAgentProtocol } from "happy-desktop-state";
import { useState } from "react";
import { Icon } from "./Icon";
import { ScrollArea } from "./Scrollbar";
import { StickerView, type StorySticker } from "./StickerView";
import { STORY_EMOJI_CATEGORIES } from "./storyEmoji";
import type { Sticker, StickerPack, StickerPackKind } from "./storyTypes";

export interface StickerPickerPack {
    readonly pack: StickerPack;
    /** Absent until the pack's stickers are read. */
    readonly stickers?: readonly Sticker[];
}

export interface StickerPickerProps {
    readonly packs: readonly StickerPickerPack[];
    /** The person's recently used stickers that are still in the catalog, most recent first. */
    readonly recents: readonly Sticker[];
    readonly query: string;
    /** Results of the search in the field, while it holds text. */
    readonly results?: { readonly loading: boolean; readonly stickers: readonly Sticker[] };
    readonly stickerOf: (sticker: Sticker) => StorySticker;
    onQueryChange(query: string, kind: StickerPackKind): void;
    onStickerSelect(sticker: Sticker): void;
    onEmojiSelect(emoji: string): void;
    onRecentsClear(): void;
    onClose(): void;
}

/** The gap between cells, in the grid's columns rule; the API's `spacing`. */
const SPACING = 4;
/** The panel's inner width less its inline padding: what the grid lays out in. */
const PANEL_INNER = 360 - 2 * 12;

function Grid(props: {
    readonly kind: StickerPackKind;
    readonly stickers: readonly Sticker[];
    readonly stickerOf: (sticker: Sticker) => StorySticker;
    onSelect(sticker: Sticker): void;
}) {
    const columns = happyAgentProtocol.stickerGridColumns(props.kind, PANEL_INNER, SPACING);
    return (
        <div
            className="happy-sticker-picker__grid"
            data-kind={props.kind}
            style={{ gridTemplateColumns: `repeat(${String(columns)}, 1fr)` }}
        >
            {props.stickers.map((sticker) => (
                <button
                    aria-label={`Sticker ${sticker.emoji.join(" ")}`}
                    className="happy-sticker-picker__cell"
                    key={`${sticker.packId}/${sticker.id}`}
                    onClick={() => props.onSelect(sticker)}
                    type="button"
                >
                    <StickerView sticker={props.stickerOf(sticker)} />
                </button>
            ))}
        </div>
    );
}

/**
 * The sticker picker, as Telegram draws its sticker panel and simplified as
 * asked: search at the top; one continuous scroll that starts with Recently
 * used and its ✕, then every pack under its name; and a floating Stickers /
 * Emoji switch at the bottom. No pack strip, GIFs, favourites, or trending.
 */
export function StickerPicker(props: StickerPickerProps) {
    const [tab, setTab] = useState<StickerPackKind>("stickers");
    const searching = props.query.trim() !== "";
    const packs = props.packs.filter((entry) => entry.pack.kind === tab);
    return (
        <div
            className="happy-sticker-picker"
            data-happy-desktop-ui="sticker-picker"
            data-testid="sticker-picker"
            onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.stopPropagation();
                props.onClose();
            }}
        >
            <div className="happy-sticker-picker__search">
                <Icon name="search" size={16} />
                <input
                    aria-label={tab === "stickers" ? "Search stickers" : "Search emoji"}
                    autoFocus
                    className="happy-sticker-picker__field"
                    onChange={(event) => props.onQueryChange(event.currentTarget.value, tab)}
                    placeholder="Search"
                    type="search"
                    value={props.query}
                />
                <button
                    aria-label="Close stickers"
                    className="happy-sticker-picker__close"
                    onClick={props.onClose}
                    type="button"
                >
                    <Icon name="close" size={16} />
                </button>
            </div>
            <ScrollArea
                className="happy-sticker-picker__body"
                viewportClassName="happy-sticker-picker__viewport"
            >
                <div className="happy-sticker-picker__content">
                    {searching ? (
                        props.results && props.results.stickers.length > 0 ? (
                            <Grid
                                kind={tab}
                                onSelect={props.onStickerSelect}
                                stickerOf={props.stickerOf}
                                stickers={props.results.stickers}
                            />
                        ) : (
                            <span className="happy-sticker-picker__empty">
                                {props.results?.loading !== false
                                    ? "Searching…"
                                    : "No stickers found"}
                            </span>
                        )
                    ) : (
                        <>
                            {tab === "stickers" && props.recents.length > 0 ? (
                                <section className="happy-sticker-picker__section">
                                    <header className="happy-sticker-picker__heading">
                                        <span className="happy-sticker-picker__title">
                                            Recently used
                                        </span>
                                        <button
                                            aria-label="Clear recently used"
                                            className="happy-sticker-picker__clear"
                                            onClick={props.onRecentsClear}
                                            type="button"
                                        >
                                            <Icon name="close" size={12} />
                                        </button>
                                    </header>
                                    <Grid
                                        kind="stickers"
                                        onSelect={props.onStickerSelect}
                                        stickerOf={props.stickerOf}
                                        stickers={props.recents}
                                    />
                                </section>
                            ) : null}
                            {tab === "emoji"
                                ? STORY_EMOJI_CATEGORIES.map((category) => (
                                      <section
                                          className="happy-sticker-picker__section"
                                          key={category.id}
                                      >
                                          <header className="happy-sticker-picker__heading">
                                              <span className="happy-sticker-picker__title">
                                                  {category.title}
                                              </span>
                                          </header>
                                          <div
                                              className="happy-sticker-picker__grid"
                                              data-kind="emoji"
                                              style={{
                                                  gridTemplateColumns: `repeat(${String(
                                                      happyAgentProtocol.stickerGridColumns(
                                                          "emoji",
                                                          PANEL_INNER,
                                                          SPACING,
                                                      ),
                                                  )}, 1fr)`,
                                              }}
                                          >
                                              {category.emoji.map((emoji) => (
                                                  <button
                                                      aria-label={emoji}
                                                      className="happy-sticker-picker__cell"
                                                      data-emoji=""
                                                      key={emoji}
                                                      onClick={() => props.onEmojiSelect(emoji)}
                                                      type="button"
                                                  >
                                                      {emoji}
                                                  </button>
                                              ))}
                                          </div>
                                      </section>
                                  ))
                                : null}
                            {packs.map((entry) => (
                                <section
                                    className="happy-sticker-picker__section"
                                    data-testid="sticker-picker-pack"
                                    key={entry.pack.id}
                                >
                                    <header
                                        className="happy-sticker-picker__heading"
                                        data-centred=""
                                    >
                                        {/* Uppercase by Kirill's direct instruction for the
                                            picker, as Telegram writes pack names; it overrides
                                            the design system's sentence-case rule here only. */}
                                        <span className="happy-sticker-picker__title" data-pack="">
                                            {entry.pack.title}
                                        </span>
                                    </header>
                                    {entry.stickers ? (
                                        <Grid
                                            kind={entry.pack.kind}
                                            onSelect={props.onStickerSelect}
                                            stickerOf={props.stickerOf}
                                            stickers={entry.stickers}
                                        />
                                    ) : (
                                        <span className="happy-sticker-picker__empty">
                                            Loading…
                                        </span>
                                    )}
                                </section>
                            ))}
                        </>
                    )}
                </div>
            </ScrollArea>
            <div className="happy-sticker-picker__switch" role="tablist">
                {(["stickers", "emoji"] as const).map((kind) => (
                    <button
                        aria-selected={tab === kind}
                        className="happy-sticker-picker__switch-option"
                        key={kind}
                        onClick={() => {
                            setTab(kind);
                            if (searching) props.onQueryChange(props.query, kind);
                        }}
                        role="tab"
                        type="button"
                    >
                        {kind === "stickers" ? "Stickers" : "Emoji"}
                    </button>
                ))}
            </div>
        </div>
    );
}
