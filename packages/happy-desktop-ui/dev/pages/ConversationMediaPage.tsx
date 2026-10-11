import { ConversationMedia } from "../../src/ConversationMedia";
import { conversationMediaHeight } from "../../src/conversationRowHeight";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import {
    mediaDocument,
    mediaFile,
    mediaImageSquare,
    mediaImageTall,
    mediaImageWide,
    mediaVideo,
} from "./conversationMediaFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-294";

const MEASURE = 560;

function sized(items: Parameters<typeof conversationMediaHeight>[0]) {
    return `${String(MEASURE)}px measure · ${String(Math.round(conversationMediaHeight(items, MEASURE)))}px reserved by the row model`;
}

export function ConversationMediaPage() {
    const single = [mediaImageWide];
    const grid = [mediaImageSquare, mediaImageWide, mediaImageTall];
    const mixed = [mediaImageSquare, mediaVideo, mediaDocument, mediaFile];
    return (
        <ComponentPage
            number={componentNumber}
            summary="The files one tool call presented, beneath its transcript line: pictures first, then recordings, then a card per document or file."
            title="ConversationMedia"
        >
            <Specimen
                detail="one generated picture at its own box"
                label="One picture"
                number="01"
                stage="surface"
            >
                <div style={{ width: `${String(MEASURE)}px` }}>
                    <ConversationMedia items={single} onItemOpen={() => {}} />
                </div>
                <DimensionRule label={sized(single)} />
            </Specimen>
            <Specimen
                detail="two or more pictures as a 420px two-column square grid, 4px gaps"
                label="Several pictures"
                number="02"
                stage="surface"
            >
                <div style={{ width: `${String(MEASURE)}px` }}>
                    <ConversationMedia items={grid} onItemOpen={() => {}} />
                </div>
                <DimensionRule label={sized(grid)} />
            </Specimen>
            <Specimen
                detail="picture · inline recording · PDF card · file card, 8px apart"
                label="Mixed presentation"
                number="03"
                stage="surface"
            >
                <div style={{ width: `${String(MEASURE)}px` }}>
                    <ConversationMedia items={mixed} onItemOpen={() => {}} />
                </div>
                <DimensionRule label={sized(mixed)} />
            </Specimen>
        </ComponentPage>
    );
}
