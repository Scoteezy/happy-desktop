import { useState, type ReactNode } from "react";
import { clayIconMark, happyIconMark, type ClayIconSlug } from "../../src/clayIcons";
import {
    Sidebar,
    type SidebarItem,
    type SidebarItemChange,
    type SidebarReorder,
    type SidebarSeparatorPinEdge,
} from "../../src/Sidebar";
import { SidebarAgentUpdate } from "../../src/SidebarAgentUpdate";
import { SidebarChanges } from "../../src/SidebarChanges";
import { SidebarFooter } from "../../src/SidebarFooter";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-318";

const noop = () => undefined;

const row = (id: string, label: string, slug: ClayIconSlug, extra?: Partial<SidebarItem>) =>
    ({
        id,
        imageMark: clayIconMark(slug),
        kind: "project",
        label,
        ...extra,
    }) satisfies SidebarItem;
const heading = (id: string, label: string, extra?: Partial<SidebarItem>) =>
    ({ collapsed: false, id, kind: "section", label, ...extra }) satisfies SidebarItem;

/** One change of the proposal, as one row shows it. */
const change = (
    kind: SidebarItemChange["kind"],
    label?: string,
    block?: "head" | "member",
    from?: SidebarItemChange["from"],
) =>
    ({
        kind,
        ...(label === undefined ? {} : { label }),
        ...(block === undefined ? {} : { block }),
        ...(from === undefined ? {} : { from }),
    }) satisfies SidebarItemChange;

type ProposalRow = SidebarItem & { readonly group?: string };

/*
 * Prioritizing's proposal on a person's sidebar: two rows moved between
 * sections (each drawn where it is and where it lands), a session brought
 * back, two tasks archived, the Writing section moved to the top as one
 * block, and the Old experiments section archived as one block.
 */
const PROPOSAL: readonly ProposalRow[] = [
    { icon: "search", id: "search", kind: "action", label: "Search" },
    { icon: "compose", id: "create", kind: "action", label: "Create" },
    { id: "happy", imageMark: happyIconMark(), kind: "project", label: "Happy" },
    row("prioritizing", "Prioritizing", "triage", { unread: true }),
    {
        ...heading("to:writing", "Writing"),
        change: change("arrive", "Moving Writing here from below Research", "head", "writing"),
        group: "writing",
    },
    {
        ...row("to:launch", "Launch post draft", "wip"),
        change: change("arrive", undefined, "member"),
        group: "writing",
    },
    {
        ...row("to:changelog", "Changelog for 0.0.102", "refactor"),
        change: change("arrive", undefined, "member"),
        group: "writing",
    },
    heading("releases", "Releases", {
        action: { icon: "plus", label: "New in Releases", reveal: "hover" },
    }),
    row("signing", "Windows installer signing", "deploy"),
    {
        ...row("ship-102", "Release 0.0.102", "app-store-release"),
        change: change("archive", "Archiving"),
        group: "ship",
    },
    {
        ...row("to:notarize", "Notarize the macOS build", "build"),
        change: change("arrive", "Moving here from Desktop", undefined, "notarize"),
        group: "notarize",
    },
    heading("desktop", "Desktop"),
    row("inline-diffs", "Inline sidebar diffs", "new-feature", { collapsed: false }),
    {
        depth: 1,
        icon: "chat",
        id: "argon",
        kind: "agent",
        label: "Argon reviews the screenshots",
    },
    {
        ...row("latency", "Voice dictation latency", "debugging"),
        change: change("move", "Moving to Research"),
        group: "latency",
    },
    {
        ...row("notarize", "Notarize the macOS build", "build"),
        change: change("move", "Moving to Releases"),
        group: "notarize",
    },
    heading("research", "Research and the flaky test hunt", {
        action: { icon: "plus", label: "New in Research", reveal: "hover" },
    }),
    row("bench", "Model mix benchmarks", "investigate"),
    {
        ...row("to:latency", "Voice dictation latency", "debugging"),
        change: change("arrive", "Moving here from Desktop", undefined, "latency"),
        group: "latency",
    },
    {
        ...row("gym-hunt", "Gym flake hunt", "flaky"),
        change: change("insert", "Bringing back from the archive"),
        group: "gym",
    },
    {
        ...row("flaky", "Flaky gym test", "testing"),
        change: change("archive", "Archiving"),
        group: "flaky",
    },
    {
        ...heading("writing", "Writing"),
        change: change("move", "Moving Writing to the top", "head"),
        group: "writing",
    },
    {
        ...row("launch", "Launch post draft", "wip"),
        change: change("move", undefined, "member"),
        group: "writing",
    },
    {
        ...row("changelog", "Changelog for 0.0.102", "refactor"),
        change: change("move", undefined, "member"),
        group: "writing",
    },
    {
        ...heading("old", "Old experiments"),
        change: change("archive", "Archiving Old experiments", "head"),
        group: "old",
    },
    {
        ...row("dither", "Dither chart prototype", "code"),
        change: change("archive", undefined, "member"),
        group: "old",
    },
    {
        ...row("clone", "Voice clone test", "cleanup"),
        change: change("archive", undefined, "member"),
        group: "old",
    },
    heading("distractions", "Distractions", { collapsed: true }),
    row("sourdough", "Sourdough starter ratio", "wip"),
];

/** A row with its change answered: it stays, as an ordinary row. */
const settled = (entry: ProposalRow): ProposalRow => {
    const { change: _change, group: _group, ...rest } = entry;
    return rest;
};

/** The rows once `group` is accepted: what leaves goes, what lands stays. */
function accepted(rows: readonly ProposalRow[], group: string): ProposalRow[] {
    return rows.flatMap((entry) => {
        if (entry.group !== group) return [entry];
        return entry.change?.kind === "move" || entry.change?.kind === "archive"
            ? []
            : [settled(entry)];
    });
}

/** The rows once the proposal, or one `group` of it, is declined: what would land goes, the rest stays as it was. */
function rejected(rows: readonly ProposalRow[], group?: string): ProposalRow[] {
    return rows.flatMap((entry) =>
        group !== undefined && entry.group !== group
            ? [entry]
            : entry.change?.kind === "arrive" || entry.change?.kind === "insert"
              ? []
              : [entry.change ? settled(entry) : entry],
    );
}

function folded<T extends SidebarItem>(rows: readonly T[], id: string): T[] {
    return rows.map((entry) =>
        entry.id === id ? { ...entry, collapsed: !entry.collapsed } : entry,
    );
}

/** The proposal on the sidebar as the window draws it, live: marks, Accept, Reject. */
function ProposedSidebar(props: { readonly screen: string; readonly height: number }): ReactNode {
    const [rows, setRows] = useState<readonly ProposalRow[]>(PROPOSAL);
    const pending = rows.some((entry) => entry.change !== undefined);
    const groupOf = (id: string) => rows.find((entry) => entry.id === id)?.group;
    return (
        <div
            data-screen={props.screen}
            style={{
                background: "var(--groupped-background)",
                display: "flex",
                flexDirection: "column",
                height: `${String(props.height)}px`,
                width: "300px",
            }}
        >
            <Sidebar
                activeItemId="inline-diffs"
                bodyFloat={
                    pending ? (
                        <SidebarChanges
                            onAccept={() =>
                                setRows((current) =>
                                    [...new Set(current.map((entry) => entry.group))].reduce(
                                        (next: readonly ProposalRow[], group) =>
                                            group === undefined ? next : accepted(next, group),
                                        current,
                                    ),
                                )
                            }
                            onChat={noop}
                            onReject={() => setRows((current) => rejected(current))}
                            proposer="Prioritizing"
                        />
                    ) : undefined
                }
                foldControlPlacement="trailing"
                foldControlReveal="hover"
                footer={<SidebarFooter onSettingsOpen={noop} />}
                onItemAction={noop}
                onItemChangeAccept={(id) => {
                    const group = groupOf(id);
                    if (group !== undefined) setRows((current) => accepted(current, group));
                }}
                onItemChangeReject={(id) => {
                    const group = groupOf(id);
                    if (group !== undefined) setRows((current) => rejected(current, group));
                }}
                onItemCollapseToggle={(id) => setRows((current) => folded(current, id))}
                onItemSelect={noop}
                sections={[{ id: "spaces", items: [...rows] }]}
                style={{ width: "100%" }}
            />
        </div>
    );
}

/** A long sidebar in a short window, for folding near its end. */
const LONG: SidebarItem[] = [
    { icon: "search", id: "search", kind: "action", label: "Search" },
    { icon: "compose", id: "create", kind: "action", label: "Create" },
    { id: "happy", imageMark: happyIconMark(), kind: "project", label: "Happy" },
    ...(
        [
            ["releases", "Releases", ["deploy", "app-store-release", "build"]],
            ["desktop", "Desktop", ["new-feature", "debugging", "code"]],
            ["research", "Research", ["investigate", "testing", "flaky"]],
            ["writing", "Writing", ["wip", "refactor", "cleanup"]],
            ["infra", "Infra", ["infra", "database", "migration"]],
        ] as const
    ).flatMap(([id, label, slugs]) => [
        heading(id, label),
        ...slugs.map((slug, index) =>
            row(`${id}-${String(index)}`, `${label} task ${String(index + 1)}`, slug),
        ),
    ]),
    heading("later", "Later", { collapsed: true }),
    row("later-0", "Read the WebKit notes", "investigate"),
    row("later-1", "Sort the photo library", "cleanup"),
    row("later-2", "Plan the offsite", "project-kickoff"),
    row("later-3", "Renew the domain", "config"),
];

/** Folding near the end of a scrolled sidebar, with the bar and the update card over its foot. */
function FoldingSidebar(props: { readonly screen: string }): ReactNode {
    const [rows, setRows] = useState(LONG);
    const [bar, setBar] = useState(true);
    const [update, setUpdate] = useState(false);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
                <button data-demo="bar" onClick={() => setBar((shown) => !shown)} type="button">
                    Bar
                </button>
                <button
                    data-demo="update"
                    onClick={() => setUpdate((shown) => !shown)}
                    type="button"
                >
                    Update card
                </button>
            </div>
            <div
                data-screen={props.screen}
                style={{
                    background: "var(--groupped-background)",
                    display: "flex",
                    flexDirection: "column",
                    height: "600px",
                    width: "300px",
                }}
            >
                <Sidebar
                    activeItemId="desktop-0"
                    bodyFloat={
                        bar ? (
                            <SidebarChanges
                                onAccept={noop}
                                onChat={noop}
                                onReject={noop}
                                proposer="Prioritizing"
                            />
                        ) : undefined
                    }
                    foldControlPlacement="trailing"
                    foldControlReveal="hover"
                    footer={
                        <SidebarFooter
                            actions={
                                <SidebarAgentUpdate
                                    expanded={update}
                                    onCollapse={() => setUpdate(false)}
                                    onToggle={() => setUpdate((shown) => !shown)}
                                    view={{ elapsedMs: 264_000, kind: "starting" }}
                                />
                            }
                            onSettingsOpen={noop}
                        />
                    }
                    onItemCollapseToggle={(id) => setRows((current) => folded(current, id))}
                    onItemSelect={noop}
                    sections={[{ id: "spaces", items: rows }]}
                    style={{ width: "100%" }}
                />
            </div>
        </div>
    );
}

/** A sidebar with two separators the person can pin, one to each edge. */
const PINNABLE: SidebarItem[] = [
    { icon: "search", id: "search", kind: "action", label: "Search" },
    { icon: "compose", id: "create", kind: "action", label: "Create" },
    { id: "happy", imageMark: happyIconMark(), kind: "project", label: "Happy" },
    { id: "sep-early", kind: "separator", label: "" },
    row("prioritizing", "Prioritizing", "triage"),
    row("focus", "Inline sidebar diffs", "new-feature"),
    { id: "sep-top", kind: "separator", label: "" },
    ...(
        [
            ["releases", "Releases", ["deploy", "app-store-release", "build"]],
            ["desktop", "Desktop", ["new-feature", "debugging", "code"]],
            ["research", "Research", ["investigate", "testing", "flaky"]],
            ["writing", "Writing", ["wip", "refactor", "cleanup"]],
            ["infra", "Infra", ["infra", "database", "migration"]],
        ] as const
    ).flatMap(([id, label, slugs]) => [
        heading(id, label),
        ...slugs.map((slug, index) =>
            row(`${id}-${String(index)}`, `${label} task ${String(index + 1)}`, slug),
        ),
    ]),
    { id: "sep-bottom", kind: "separator", label: "" },
    row("inbox", "Inbox", "triage"),
    row("calendar", "This week", "config"),
];

const PIN_MENU_TOP = "pin-top";
const PIN_MENU_BOTTOM = "pin-bottom";
const PIN_MENU_OFF = "pin-off";

/** One top-level move, as the document applies it: a heading carries its run. */
function moved(rows: readonly SidebarItem[], move: SidebarReorder): SidebarItem[] {
    const breaks = (item: SidebarItem) => item.kind === "section" || item.kind === "separator";
    const from = rows.findIndex((item) => item.id === move.id);
    let end = from + 1;
    if (rows[from]!.kind === "section") while (end < rows.length && !breaks(rows[end]!)) end += 1;
    const carried = rows.slice(from, end);
    const rest = [...rows.slice(0, from), ...rows.slice(end)];
    let at = 0;
    if (move.afterId !== null) {
        const after = rest.findIndex((item) => item.id === move.afterId);
        at = after + 1;
        if (rows[from]!.kind === "section" && rest[after]!.kind === "section")
            while (at < rest.length && !breaks(rest[at]!)) at += 1;
    }
    return [...rest.slice(0, at), ...carried, ...rest.slice(at)];
}

/** Separators pinned from their menu, one to each edge at most. */
function PinnedSidebar(props: {
    readonly screen: string;
    readonly height: number;
    readonly pins?: { readonly top?: string; readonly bottom?: string };
}): ReactNode {
    const [rows, setRows] = useState<readonly SidebarItem[]>(() =>
        PINNABLE.map((item) =>
            item.id === props.pins?.top
                ? { ...item, pin: "top" as const }
                : item.id === props.pins?.bottom
                  ? { ...item, pin: "bottom" as const }
                  : item,
        ),
    );
    const pin = (id: string, edge: SidebarSeparatorPinEdge | null) =>
        setRows((current) =>
            current.map((item) => {
                if (item.id === id) {
                    const { pin: _, ...rest } = item;
                    return edge === null ? rest : { ...rest, pin: edge };
                }
                if (edge !== null && item.pin === edge) {
                    const { pin: _, ...rest } = item;
                    return rest;
                }
                return item;
            }),
        );
    return (
        <div
            data-screen={props.screen}
            style={{
                background: "var(--groupped-background)",
                display: "flex",
                flexDirection: "column",
                height: `${String(props.height)}px`,
                width: "300px",
            }}
        >
            <Sidebar
                activeItemId="focus"
                bodyFloat={
                    <SidebarChanges
                        onAccept={noop}
                        onChat={noop}
                        onReject={noop}
                        proposer="Prioritizing"
                    />
                }
                foldControlPlacement="trailing"
                foldControlReveal="hover"
                footer={<SidebarFooter onSettingsOpen={noop} />}
                itemDragAcrossSections
                itemMenuItems={(item) =>
                    item.kind === "separator"
                        ? [
                              {
                                  icon: "arrow-up",
                                  id: PIN_MENU_TOP,
                                  kind: "item",
                                  label: "Pin above",
                              },
                              {
                                  icon: "arrow-down",
                                  id: PIN_MENU_BOTTOM,
                                  kind: "item",
                                  label: "Pin below",
                              },
                              ...(item.pin
                                  ? [
                                        { kind: "separator" as const },
                                        {
                                            icon: "close" as const,
                                            id: PIN_MENU_OFF,
                                            kind: "item" as const,
                                            label: "Unpin",
                                        },
                                    ]
                                  : []),
                          ]
                        : []
                }
                onItemCollapseToggle={(id) => setRows((current) => folded(current, id))}
                onItemMenuSelect={(item, actionId) =>
                    pin(
                        item.id,
                        actionId === PIN_MENU_TOP
                            ? "top"
                            : actionId === PIN_MENU_BOTTOM
                              ? "bottom"
                              : null,
                    )
                }
                onItemReorder={(_, move) => setRows((current) => moved(current, move))}
                onItemSelect={noop}
                sections={[{ id: "spaces", items: [...rows] }]}
                style={{ width: "100%" }}
            />
        </div>
    );
}

/** The fold on a row with children, with and without a mark, never moves. */
const RIBBON: SidebarItem[] = [
    row("plain", "A row with children", "new-feature", { collapsed: false }),
    { depth: 1, icon: "chat", id: "plain-child", kind: "agent", label: "Its session" },
    {
        ...row("marked", "Archived with children", "deploy", { collapsed: false }),
        change: change("archive", "Archiving"),
    },
    { depth: 1, icon: "chat", id: "marked-child", kind: "agent", label: "Its session" },
    {
        ...row("arrived", "Moving here with children", "debugging", { collapsed: true }),
        change: change("arrive", "Moving here from Desktop"),
    },
    { depth: 1, icon: "chat", id: "arrived-child", kind: "agent", label: "Its session" },
    { depth: 1, icon: "chat", id: "arrived-review", kind: "agent", label: "Its review" },
    row("leaf", "A row without children", "build", { change: change("archive", "Archiving") }),
    {
        ...row("leaving", "Leaving with children", "investigate", { collapsed: true }),
        change: change("move", "Moving to Research"),
    },
    { depth: 1, icon: "chat", id: "leaving-child", kind: "agent", label: "Its session" },
    { depth: 1, icon: "chat", id: "leaving-review", kind: "agent", label: "Its review" },
];

function RibbonSidebar(props: { readonly screen: string }): ReactNode {
    const [rows, setRows] = useState<readonly SidebarItem[]>(RIBBON);
    return (
        <div
            data-screen={props.screen}
            style={{
                background: "var(--groupped-background)",
                display: "flex",
                flexDirection: "column",
                height: "380px",
                width: "300px",
            }}
        >
            <Sidebar
                activeItemId=""
                foldControlPlacement="trailing"
                foldControlReveal="hover"
                onItemChangeAccept={noop}
                onItemChangeReject={noop}
                onItemCollapseToggle={(id) => setRows((current) => folded(current, id))}
                onItemSelect={noop}
                sections={[{ id: "spaces", items: [...rows] }]}
                style={{ width: "100%" }}
            />
        </div>
    );
}

export function SidebarChangesPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Prioritizing's proposal, shown in the sidebar itself as a quiet diff. A row it would move is drawn where it would land, washed green, with an arrow pointing back at it that says where it comes from and lights the dimmed row it leaves; a row it would add stands green where it would go; a row it would archive is washed red. A change to a whole section is one block. A mark accepts its one change; Accept, Reject and Chat float over the foot of the rows and answer the rest. Reorders alone are not shown."
            title="Sidebar changes"
        >
            {(["light", "dark"] as const).map((mode) => (
                <Specimen
                    detail="300 px sidebar · marks on the fold's 18 px column · blocks one backdrop · bar 36 px, 8 px over the footer"
                    key={mode}
                    label={`A proposal on the sidebar — ${mode}`}
                    number={mode === "light" ? "01" : "02"}
                    stage="chrome"
                >
                    <ThemeScope mode={mode}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <ProposedSidebar height={940} screen={`proposal-${mode}`} />
                            <DimensionRule label="Accept a mark, or all of them from the bar" />
                        </div>
                    </ThemeScope>
                </Specimen>
            ))}
            <Specimen
                detail="300 × 600 · 136 px floor under the last row · held space keeps the top still"
                label="Folding near the end"
                number="03"
                stage="chrome"
            >
                <ThemeScope mode="light">
                    <FoldingSidebar screen="folding-light" />
                </ThemeScope>
            </Specimen>
            {(["light", "dark"] as const).map((mode, index) => (
                <Specimen
                    detail="300 × 640 · a separator pinned from its menu holds its edge still · the rows left to scroll keep half the column, or the pin warns"
                    key={`pins-${mode}`}
                    label={`Pinned separators — ${mode}`}
                    number={index === 0 ? "04" : "05"}
                    stage="chrome"
                >
                    <ThemeScope mode={mode}>
                        <div style={{ display: "flex", gap: "16px" }}>
                            <PinnedSidebar height={640} screen={`pins-${mode}`} />
                            <PinnedSidebar
                                height={640}
                                pins={{ bottom: "sep-bottom", top: "sep-early" }}
                                screen={`pins-both-${mode}`}
                            />
                        </div>
                    </ThemeScope>
                </Specimen>
            ))}
            <Specimen
                detail="A row's fold is its last column, always shown, on one edge; marks stand left of it"
                label="The fold never moves"
                number="06"
                stage="chrome"
            >
                <ThemeScope mode="light">
                    <RibbonSidebar screen="ribbon-light" />
                </ThemeScope>
            </Specimen>
        </ComponentPage>
    );
}
