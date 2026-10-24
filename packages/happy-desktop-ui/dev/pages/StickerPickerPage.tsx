import { useState } from "react";
import { StickerPicker } from "../../src";
import type { Sticker } from "../../src/storyTypes";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import { STICKER_PACKS, fixtureStickerOf } from "./storyFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-316";

const noop = () => {};
const all = STICKER_PACKS.flatMap((entry) => entry.stickers ?? []);
const recents = all.slice(2, 7);

/** A working picker over the fixture packs: search filters by emoji, picks join the recents. */
function LivePicker() {
    const [query, setQuery] = useState("");
    const [used, setUsed] = useState<readonly Sticker[]>(recents);
    const results =
        query === ""
            ? undefined
            : { loading: false, stickers: all.filter((sticker) => sticker.emoji.includes(query)) };
    return (
        <StickerPicker
            onClose={noop}
            onEmojiSelect={noop}
            onQueryChange={(value) => setQuery(value)}
            onRecentsClear={() => setUsed([])}
            onStickerSelect={(sticker) =>
                setUsed((list) =>
                    [sticker, ...list.filter((entry) => entry.id !== sticker.id)].slice(0, 20),
                )
            }
            packs={STICKER_PACKS}
            query={query}
            recents={used}
            {...(results ? { results } : {})}
            stickerOf={fixtureStickerOf}
        />
    );
}

function Frame(props: { readonly children: React.ReactNode }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "360px" }}>
            <DimensionRule label="width 360" />
            <div style={{ display: "flex", height: "520px" }}>{props.children}</div>
        </div>
    );
}

export function StickerPickerPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The story editor's sticker picker: a search field, Recently used with its clear button, then every pack under its centred uppercase name, laid out with the daemon's grid column rule. A floating switch moves between Stickers and Emoji."
            title="Sticker picker"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="Live: search by emoji, pick, clear"
                    label="Stickers"
                    number="SP-01"
                    stage="surface"
                >
                    <Frame>
                        <LivePicker />
                    </Frame>
                </Specimen>
                <Specimen detail="No recents yet" label="First use" number="SP-02" stage="surface">
                    <Frame>
                        <StickerPicker
                            onClose={noop}
                            onEmojiSelect={noop}
                            onQueryChange={noop}
                            onRecentsClear={noop}
                            onStickerSelect={noop}
                            packs={STICKER_PACKS}
                            query=""
                            recents={[]}
                            stickerOf={fixtureStickerOf}
                        />
                    </Frame>
                </Specimen>
                <Specimen
                    detail="A search that matched nothing"
                    label="No results"
                    number="SP-03"
                    stage="surface"
                >
                    <Frame>
                        <StickerPicker
                            onClose={noop}
                            onEmojiSelect={noop}
                            onQueryChange={noop}
                            onRecentsClear={noop}
                            onStickerSelect={noop}
                            packs={STICKER_PACKS}
                            query="🦄"
                            recents={recents}
                            results={{ loading: false, stickers: [] }}
                            stickerOf={fixtureStickerOf}
                        />
                    </Frame>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
