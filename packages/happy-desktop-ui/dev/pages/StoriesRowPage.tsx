import { useState, type ReactNode } from "react";
import { Button, StoriesRow, type StoriesRowAuthor } from "../../src";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import { storyAvatar } from "./storyFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-312";

const noop = () => {};

const team: readonly StoriesRowAuthor[] = [
    {
        id: "me",
        name: "My Story",
        initials: "KD",
        self: true,
        ring: "seen",
        stories: { total: 1, unseen: 0 },
        photoUrl: storyAvatar("#5b6cff"),
    },
    {
        id: "ana",
        name: "Ana",
        initials: "AN",
        self: false,
        ring: "unseen",
        stories: { total: 2, unseen: 2 },
        photoUrl: storyAvatar("#ff7a59"),
    },
    {
        id: "sam",
        name: "Sam",
        initials: "SA",
        self: false,
        ring: "unseen",
        stories: { total: 4, unseen: 1 },
    },
    {
        id: "lee",
        name: "Leonardo",
        initials: "LE",
        self: false,
        ring: "seen",
        stories: { total: 3, unseen: 0 },
        photoUrl: storyAvatar("#2bb673"),
    },
    {
        id: "mo",
        name: "Mo",
        initials: "MO",
        self: false,
        ring: "seen",
        photoUrl: storyAvatar("#a35bff"),
    },
    { id: "jo", name: "Jo", initials: "JO", self: false, ring: "seen" },
];

const seen: readonly StoriesRowAuthor[] = team
    .slice(1)
    .map((author) => ({ ...author, ring: "seen" as const }));

function Band(props: { readonly width: number; readonly children: ReactNode }) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                width: `${String(props.width)}px`,
            }}
        >
            <DimensionRule label={`width ${String(props.width)}`} />
            {props.children}
        </div>
    );
}

/** The fold played live: the circles shrink into the strip and grow back out. */
function LiveFold() {
    const [collapsed, setCollapsed] = useState(false);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <Band width={260}>
                <StoriesRow
                    authors={team}
                    collapsed={collapsed}
                    onAuthorOpen={noop}
                    onCollapse={() => setCollapsed(true)}
                    onExpand={() => setCollapsed(false)}
                />
            </Band>
            <Button onClick={() => setCollapsed(!collapsed)} size="small" variant="secondary">
                {collapsed ? "Unfold" : "Fold"}
            </Button>
        </div>
    );
}

export function StoriesRowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The stories band above the sidebar's search: everyone with a story up, the person first while theirs is, each with a green-to-blue ring segmented per story while unseen and a thin grey one once seen, to the iOS row's numbers. It folds into a 40px strip of up to three overlapping photos when the person folds it or has seen everything, and stays folded until they open it; with no stories it takes no room."
            title="Stories row"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="Sidebar width 260 · band 98 · unseen rings and initials without a photo"
                    label="Open"
                    number="SR-01"
                    stage="chrome"
                >
                    <Band width={260}>
                        <StoriesRow
                            authors={team}
                            collapsed={false}
                            onAuthorOpen={noop}
                            onCollapse={noop}
                            onExpand={noop}
                        />
                    </Band>
                </Specimen>
                <Specimen
                    detail="Band 40 · three 24px photos 14px apart · something unseen"
                    label="Folded"
                    number="SR-02"
                    stage="chrome"
                >
                    <Band width={260}>
                        <StoriesRow
                            authors={team}
                            collapsed
                            onAuthorOpen={noop}
                            onCollapse={noop}
                            onExpand={noop}
                        />
                    </Band>
                </Specimen>
                <Specimen
                    detail="Everything seen · folded by itself"
                    label="Folded, all seen"
                    number="SR-03"
                    stage="chrome"
                >
                    <Band width={260}>
                        <StoriesRow
                            authors={seen}
                            collapsed
                            onAuthorOpen={noop}
                            onCollapse={noop}
                            onExpand={noop}
                        />
                    </Band>
                </Specimen>
                <Specimen
                    detail="Press Fold, or the chevron the row shows on hover"
                    label="Fold, live"
                    number="SR-04"
                    stage="chrome"
                >
                    <LiveFold />
                </Specimen>
            </div>
        </ComponentPage>
    );
}
