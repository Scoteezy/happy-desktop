import { useState } from "react";
import { AppShell, APP_SHELL_SIDEBAR_DEFAULT_WIDTH } from "../../src/AppShell";
import { ConnectionShell } from "../../src/ConnectionShell";
import type { IconName } from "../../src/Icon";
import { Sidebar, type SidebarItem, type SidebarSection } from "../../src/Sidebar";
import { TabbedPane } from "../../src/TabbedPane";
import { ThemeScope } from "../../src/ThemeScope";
import { WorkTranscript } from "../../src/WorkTranscript";
import { tidyAfter, tidyBefore, type TidyIconSlug, type TidyRow } from "./tidyFixtures";
import tidyDiff from "./tidyDiff.md?raw";
import { redesignComposer, redesignConnections, redesignMarks } from "./windowRedesignFixtures";

const noop = () => undefined;
const happyId = "bot:chief_of_staff";
const summary = "Tidied: 54 hidden · 22 to Older · 32 moved";
const beforeById = new Map(tidyBefore.map((row, index) => [row.id, { row, index }]));
const marks: Partial<Record<TidyIconSlug, { src: string }>> = {
    happy: redesignMarks.happy.imageMark,
    inbox: redesignMarks.inbox.imageMark,
    "onboarding-fix": redesignMarks.onboarding.imageMark,
    "release-coordinator": redesignMarks.release.imageMark,
    "analytics-watcher": redesignMarks.analytics.imageMark,
    "native-ios-integration": redesignMarks.native.imageMark,
    document: redesignMarks.document.imageMark,
    "ci-watcher": redesignMarks.ci.imageMark,
    "desktop-redesign": redesignMarks.redesign.imageMark,
    blueprint: redesignMarks.blueprint.imageMark,
    "muse-icon-research": redesignMarks.muse.imageMark,
    "keyboard-audit": redesignMarks.keyboard.imageMark,
    "shared-chat-sync": redesignMarks.sync.imageMark,
};

function projectRow(row: TidyRow): SidebarItem {
    const before = beforeById.get(row.id);
    if (!before) throw new Error(`Tidy fixture has no original row for ${row.id}`);
    // The supplied before sections explicitly state each entity's type.
    const glyph: IconName =
        before.row.section === "Surfaces"
            ? "list"
            : before.row.section === "Tasks"
              ? "tasks"
              : "agents";
    return {
        id: row.id,
        label: row.iconSlug === "stemCell" && row.visibility === "shown" ? "placing…" : row.title,
        kind: "view",
        depth: row.depth,
        icon: glyph,
        ...(row.iconSlug === "stemCell"
            ? { stemCell: { id: row.id } }
            : row.iconSlug
              ? { imageMark: marks[row.iconSlug] }
              : {}),
        status:
            row.status === "working"
                ? "working"
                : row.status === "waiting"
                  ? "awaitingInput"
                  : undefined,
        activityIndicator: "glyph",
        labelShimmer: false,
    };
}

const beforeSections = [
    { id: "surfaces", label: "Surfaces" },
    { id: "bots", label: "Bots" },
    { id: "tasks", label: "Tasks" },
] as const;
const afterSections = [
    { id: "native", label: "Native" },
    { id: "desktop", label: "Desktop" },
    { id: "agent-platform", label: "Agent platform" },
    { id: "release-ci", label: "Release & CI" },
    { id: "product", label: "Product" },
] as const;

/** Supplied before/after memberships, with no rule evaluation or data fetching. */
export function TidyStoryWindow({ scene }: { scene: "before" | "after" | "diff" }) {
    const [olderCollapsed, setOlderCollapsed] = useState(true);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [draft, setDraft] = useState("");
    const before = scene === "before";
    const rows = before ? tidyBefore : tidyAfter;
    const shown = rows.flatMap((row) =>
        row.visibility === "shown" ? [{ row, item: projectRow(row) }] : [],
    );
    const sections: SidebarSection[] = (before ? beforeSections : afterSections).map((section) => ({
        id: section.id,
        label: section.label,
        items: shown.filter(({ row }) => row.section === section.label).map(({ item }) => item),
    }));
    const older = tidyAfter.flatMap((row) =>
        row.visibility === "folded" ? [projectRow(row)] : [],
    );
    return (
        <ThemeScope mode="light">
            <div
                style={{
                    display: "flex",
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    overflow: "hidden",
                    contain: "layout paint",
                }}
            >
                <ConnectionShell
                    items={redesignConnections}
                    onSelect={noop}
                    selectedId="kirill-mac"
                    windowControls
                    windowFullScreen
                >
                    <AppShell
                        connectionRail
                        embedded
                        navigationChrome="integrated"
                        windowControls
                        windowFullScreen
                        sidebarCollapsible
                        sidebarCollapsedLayout="overlay"
                        sidebarCollapsed={sidebarCollapsed}
                        onSidebarCollapsedChange={setSidebarCollapsed}
                        sidebarDefaultWidth={APP_SHELL_SIDEBAR_DEFAULT_WIDTH}
                        sidebarSearchAction={{ label: "Search work", onClick: noop }}
                        sidebarCollapsedAction={{ label: "Make Stuff", onClick: noop }}
                        sidebar={
                            <Sidebar
                                activeItemId={happyId}
                                actions={shown
                                    .filter(({ row }) => row.section === null)
                                    .map(({ item }) => item)}
                                actionsDivider
                                composeLabel="Make Stuff"
                                composeShortcut={{ aria: "Meta+N Meta+T", caps: "⌘N" }}
                                onCompose={noop}
                                itemMarkPresentation="glyph"
                                treeConnectors={false}
                                foldControlPlacement="trailing"
                                foldControlReveal="hover"
                                onItemSelect={noop}
                                sections={sections}
                                bottomSection={
                                    before
                                        ? undefined
                                        : {
                                              id: "older",
                                              label: "Older",
                                              collapsed: olderCollapsed,
                                              items: older,
                                          }
                                }
                                onSectionCollapseToggle={(id) => {
                                    if (id === "older") setOlderCollapsed(!olderCollapsed);
                                }}
                            />
                        }
                    >
                        <TabbedPane
                            activeId={happyId}
                            tabs={[{ id: happyId, label: "Happy", ...redesignMarks.happy }]}
                            onSelect={noop}
                            tabSizing="content"
                            size="medium"
                        >
                            <WorkTranscript
                                rows={[]}
                                summary={
                                    before
                                        ? {
                                              label: "109 items · Surfaces, Bots and Tasks",
                                              details: [
                                                  "All 109 supplied rows are shown in their original order.",
                                              ],
                                          }
                                        : { label: summary, details: [], document: tidyDiff }
                                }
                                composer={{
                                    composer: { ...redesignComposer, text: draft },
                                    onComposerValueChange: setDraft,
                                    onComposerSend: () => setDraft(""),
                                    composerPlaceholder: "Message Happy…",
                                    composerFocusOnType: false,
                                }}
                            />
                        </TabbedPane>
                    </AppShell>
                </ConnectionShell>
            </div>
        </ThemeScope>
    );
}
