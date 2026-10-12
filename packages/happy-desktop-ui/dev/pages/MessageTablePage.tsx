import { type ReactNode } from "react";
import { Message } from "../../src/Message";
import {
    markdownTableFixtures,
    type MarkdownTableFixture,
} from "../../src/fixtures/markdownTables";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-289";

const cases: readonly { fixture: MarkdownTableFixture; label: string; detail: string }[] = [
    {
        fixture: "fits",
        label: "Fits on one line per cell",
        detail: "Columns at their one-line width, the leftover shared in proportion so the table fills the measure",
    },
    {
        fixture: "oneProseColumn",
        label: "One prose column",
        detail: "Step and status stay on one line; the notes column takes the rest and wraps",
    },
    {
        fixture: "severalProseColumns",
        label: "Several prose columns",
        detail: "Prose columns share the width by how much each wants beyond its widest word",
    },
    {
        fixture: "shortColumns",
        label: "Short ID and status columns",
        detail: "Columns no wider than 140 px on one line keep that line; alignment is per column",
    },
    {
        fixture: "inlineFormatting",
        label: "Inline code, bold, links",
        detail: "Cells measure with the same rich-inline model as body paragraphs",
    },
    {
        fixture: "cjkEmoji",
        label: "CJK and emoji",
        detail: "CJK breaks between characters; emoji keep their font fallback advance",
    },
    {
        fixture: "tooManyColumns",
        label: "Too many columns",
        detail: "Every column at its widest word is still wider than the measure, so the table scrolls",
    },
    {
        fixture: "emptyCells",
        label: "Empty cells, short and long rows",
        detail: "A row with no text keeps only its padding; missing cells pad, extra cells drop",
    },
    {
        fixture: "unbreakable",
        label: "Unbreakable tokens",
        detail: "A column is never narrower than its widest word: long URLs scroll instead of splitting",
    },
];

function frame(width: number, children: ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                padding: "8px 0",
                width: `${String(width)}px`,
            }}
        >
            {children}
        </div>
    );
}

export function MessageTablePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Markdown tables in chat wrap their cells at whole-pixel column widths solved from the same text model that sizes the virtual row, so a table mounts at exactly the height the list reserved."
            title="Message · Markdown tables"
        >
            {cases.map((item, index) => (
                <Specimen
                    detail={item.detail}
                    key={item.fixture}
                    label={item.label}
                    number={String(index).padStart(2, "0")}
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {frame(
                            760,
                            <Message
                                agent
                                author="Happy"
                                body={markdownTableFixtures[item.fixture]}
                            />,
                        )}
                        <DimensionRule label="760 px frame · agent body" />
                        {frame(
                            440,
                            <Message
                                agent
                                author="Happy"
                                body={markdownTableFixtures[item.fixture]}
                            />,
                        )}
                        <DimensionRule label="440 px frame · agent body" />
                    </div>
                </Specimen>
            ))}
            <Specimen
                detail="A bubble holding a table takes its full 76% cap so its columns are solved against a measure that does not depend on them"
                label="Own bubble"
                number={String(cases.length).padStart(2, "0")}
                stage="app"
            >
                {frame(
                    760,
                    <Message
                        author="Maya"
                        body={markdownTableFixtures.shortColumns}
                        own
                        time="9:41"
                    />,
                )}
            </Specimen>
        </ComponentPage>
    );
}
