import { StoriesRow, type StoriesRowAuthor } from "../../src";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import { storyAvatar } from "./storyFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-312";

const noop = () => {};

const self: StoriesRowAuthor = {
    id: "me",
    name: "My Story",
    initials: "KD",
    self: true,
    ring: "none",
};

const team: readonly StoriesRowAuthor[] = [
    { ...self, ring: "seen", stories: { total: 1, unseen: 0 }, photoUrl: storyAvatar("#5b6cff") },
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

export function StoriesRowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The stories band above the sidebar's search: the person's own circle first with its plus badge, then every author with a green-to-blue ring segmented per story while unseen and a thin grey one once seen. The band is 98px tall, to the iOS row's numbers, in every state, so the sidebar below never moves."
            title="Stories row"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="Sidebar width 260 · band 98 · nobody has posted"
                    label="Only my circle"
                    number="SR-01"
                    stage="chrome"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                            width: "260px",
                        }}
                    >
                        <DimensionRule label="width 260" />
                        <StoriesRow authors={[self]} onAuthorOpen={noop} onCreate={noop} />
                    </div>
                </Specimen>
                <Specimen
                    detail="Unseen rings first, seen after · initials without a photo"
                    label="Team"
                    number="SR-02"
                    stage="chrome"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                            width: "260px",
                        }}
                    >
                        <DimensionRule label="width 260" />
                        <StoriesRow authors={team} onAuthorOpen={noop} onCreate={noop} />
                    </div>
                </Specimen>
                <Specimen
                    detail="Wide sidebar · every circle visible"
                    label="Wide"
                    number="SR-03"
                    stage="chrome"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                            width: "420px",
                        }}
                    >
                        <DimensionRule label="width 420" />
                        <StoriesRow authors={team} onAuthorOpen={noop} onCreate={noop} />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
