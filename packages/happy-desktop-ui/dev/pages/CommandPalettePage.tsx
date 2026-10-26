import { type ReactNode } from "react";
import { Banner } from "../../src/Banner";
import { CommandPalette } from "../../src/CommandPalette";
import {
    CommandPaletteResults,
    type CommandPaletteResultsSection,
} from "../../src/CommandPaletteResults";
import { EmptyState } from "../../src/EmptyState";
import { FormRow } from "../../src/FormRow";
import { commandShortcut } from "../../src/keyboardShortcut";
import { SearchResults, type SearchResultGroup } from "../../src/SearchResults";
import { SegmentedControl } from "../../src/SegmentedControl";
import { Switch } from "../../src/Switch";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import happyMark from "../../src/assets/sidebar-icons/happy@40.png";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-060";

const suggestions: CommandPaletteResultsSection[] = [
    {
        id: "update",
        rows: [
            {
                kind: "command",
                id: "update",
                emphasis: "update",
                meta: "Version 2.6.1 · restart to apply",
                title: "Update Happy",
            },
        ],
    },
    {
        id: "recent",
        caption: "Recent",
        rows: [
            {
                kind: "command",
                id: "bot-happy",
                imageMark: { src: happyMark },
                meta: "Bot",
                title: "Happy",
            },
            {
                kind: "command",
                id: "task-release",
                avatar: { icon: "tasks", initials: "", type: "agent" },
                meta: "Task",
                title: "Release desktop",
            },
            {
                kind: "command",
                id: "project-infra",
                avatar: { initials: "S", type: "agent" },
                meta: "~/Developer/search-infra",
                title: "search-infra",
            },
        ],
    },
];

const actions: CommandPaletteResultsSection[] = [
    {
        id: "actions",
        caption: "Actions",
        rows: [
            {
                kind: "command",
                id: "sidebar-toggle",
                icon: "sidebar-collapse",
                shortcut: commandShortcut("b"),
                title: "Hide sidebar",
            },
        ],
    },
];

const typed: CommandPaletteResultsSection[] = [
    {
        id: "settings",
        caption: "Settings",
        rows: [
            {
                kind: "control",
                id: "theme",
                icon: "sun",
                label: "Theme",
                description: "Match the system appearance or pin one",
                control: (
                    <FormRow
                        density="compact"
                        control={
                            <SegmentedControl
                                aria-label="Theme"
                                onChange={() => undefined}
                                segments={[
                                    { label: "System", value: "system" },
                                    { label: "Light", value: "light" },
                                    { label: "Dark", value: "dark" },
                                ]}
                                size="small"
                                value="system"
                            />
                        }
                        description="Match the system appearance or pin one"
                        label="Theme"
                    />
                ),
            },
            {
                kind: "control",
                id: "shimmer",
                icon: "zap",
                label: "Shimmer active titles",
                description: "Animates running session, project, and workspace names",
                control: (
                    <FormRow
                        density="compact"
                        control={
                            <Switch
                                aria-label="Shimmer active titles"
                                checked
                                onChange={() => undefined}
                                size="small"
                            />
                        }
                        description="Animates running session, project, and workspace names"
                        label="Shimmer active titles"
                    />
                ),
            },
        ],
    },
    {
        id: "settings-jump",
        caption: "Settings sections",
        rows: [
            {
                kind: "command",
                id: "settings-general",
                icon: "settings",
                meta: "Settings › General",
                title: "General",
            },
        ],
    },
];

const overflowGroups: SearchResultGroup[] = (["channel", "user", "message", "file"] as const).map(
    (type) => ({
        type,
        results: Array.from({ length: 5 }, (_, index) => ({
            id: `${type}-${index + 1}`,
            title: `${type} result ${index + 1} for calm`,
            meta: `Workspace match ${index + 1}`,
        })),
    }),
);

function PaletteFrame(props: { children: ReactNode; query: string }) {
    return (
        <CommandPalette
            autoFocus={false}
            onClose={() => {}}
            onQueryChange={() => {}}
            placeholder="Search Happy Place…"
            query={props.query}
        >
            {props.children}
        </CommandPalette>
    );
}

function PaletteSpecimen(props: {
    children: ReactNode;
    detail: string;
    label: string;
    number: string;
    query: string;
}) {
    return (
        <Specimen detail={props.detail} label={props.label} number={props.number} stage="app">
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <DimensionRule label="640 × 461 fixed frame · 60px header" />
                <PaletteFrame query={props.query}>{props.children}</PaletteFrame>
            </div>
        </Specimen>
    );
}

export function CommandPalettePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Top-anchored Slack-style ⌘K palette — a fixed 640 × 461 card with its own focused search input over a stable-gutter scrollport. Renders the card only; ModalOverlay owns its dim, stacking, and placement."
            title="Command palette"
        >
            <div className="specimen-grid">
                <PaletteSpecimen
                    detail="what ⌘K opens on: a waiting update, then the tasks, bots, and chats worked in last, newest first"
                    label="Suggestions"
                    number="CP-06"
                    query=""
                >
                    <CommandPaletteResults activeIndex={0} sections={suggestions} />
                </PaletteSpecimen>
            </div>

            <div className="specimen-grid">
                <PaletteSpecimen
                    detail="a typed act finds the window's own action, wearing the chord that does the same"
                    label="Actions"
                    number="CP-08"
                    query="fold sidebar"
                >
                    <CommandPaletteResults activeIndex={0} sections={actions} />
                </PaletteSpecimen>
            </div>

            <div className="specimen-grid">
                <PaletteSpecimen
                    detail="settings rows are the settings page's own FormRows, live and highlighted in place"
                    label="Typed query"
                    number="CP-07"
                    query="the"
                >
                    <CommandPaletteResults activeIndex={0} sections={typed} />
                </PaletteSpecimen>
            </div>

            <div className="specimen-grid">
                <PaletteSpecimen
                    detail="genuinely overflowing grouped results · stable thin scrollbar · 5px nested last corner"
                    label="Overflowing results"
                    number="CP-01"
                    query="calm"
                >
                    <SearchResults groups={overflowGroups} query="calm" variant="flush" />
                </PaletteSpecimen>
            </div>

            <div className="specimen-grid">
                <PaletteSpecimen
                    detail="empty query · inline state stays near the top of the result body"
                    label="Idle"
                    number="CP-02"
                    query=""
                >
                    <EmptyState
                        description="Find channels, people, messages, and files across your workspace."
                        icon="search"
                        size="inline"
                        title="Search Happy Place"
                    />
                </PaletteSpecimen>
                <PaletteSpecimen
                    detail="in-flight query · inline state preserves the top visual target"
                    label="Searching"
                    number="CP-03"
                    query="relay"
                >
                    <EmptyState
                        description="Searching the workspace for “relay”."
                        icon="search"
                        size="inline"
                        title="Searching…"
                    />
                </PaletteSpecimen>
            </div>

            <div className="specimen-grid">
                <PaletteSpecimen
                    detail="completed query without matches · compact inline state"
                    label="No results"
                    number="CP-04"
                    query="cobalt"
                >
                    <EmptyState
                        description="No channels, people, messages, or files match “cobalt”."
                        icon="search"
                        size="inline"
                        title="No results"
                    />
                </PaletteSpecimen>
                <PaletteSpecimen
                    detail="terminal search failure · error remains at the top of the body"
                    label="Error"
                    number="CP-05"
                    query="relay"
                >
                    <Banner tone="danger" title="Search unavailable">
                        The workspace search index could not be reached.
                    </Banner>
                </PaletteSpecimen>
            </div>
        </ComponentPage>
    );
}
