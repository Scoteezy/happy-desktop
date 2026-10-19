import type {
    ComposerSnapshot,
    HappyAgentSurfaceId,
    HappyAgentSurfaceTodoId,
    HappyAgentTodoListSnapshot,
    HappyAgentUserInputRequest,
} from "happy-desktop-state";
import type { CommandPaletteResultsSection } from "../../src/CommandPaletteResults";
import type { ConnectionShellItem } from "../../src/ConnectionShell";
import type { IconName } from "../../src/Icon";
import type { SidebarItem, SidebarSection } from "../../src/Sidebar";
import type { TabItem } from "../../src/Tabs";
import type { WorkFloatyItem } from "../../src/WorkFloaty";
import type { WorkTranscriptRow } from "../../src/WorkTranscript";
import happyMark from "../../src/assets/sidebar-icons/happy@40.png";
import releaseMark from "../../src/assets/sidebar-icons/release-coordinator@40.png";
import analyticsMark from "../../src/assets/sidebar-icons/analytics-watcher@40.png";
import ciMark from "../../src/assets/sidebar-icons/ci-watcher@40.png";
import qaMark from "../../src/assets/sidebar-icons/qa-tester@40.png";
import redesignMark from "../../src/assets/sidebar-icons/desktop-redesign@40.png";
import blueprintMark from "../../src/assets/sidebar-icons/blueprint@40.png";
import museMark from "../../src/assets/sidebar-icons/muse-icon-research@40.png";
import nativeMark from "../../src/assets/sidebar-icons/native-ios-integration@40.png";
import keyboardMark from "../../src/assets/sidebar-icons/keyboard-audit@40.png";
import onboardingMark from "../../src/assets/sidebar-icons/onboarding-fix@40.png";
import moviesMark from "../../src/assets/sidebar-icons/movies-list@40.png";
import inboxMark from "../../src/assets/sidebar-icons/inbox@40.png";
import documentMark from "../../src/assets/sidebar-icons/document@40.png";
import syncMark from "../../src/assets/sidebar-icons/shared-chat-sync@40.png";

/* Source: task_52/.context/real-sessions.md, captured for this storyboard.
 * The redesign, crash, Muse and feedback excerpts are shortened from that
 * research snapshot. Crew roles, milestone grouping, running states, creation
 * flow, release-day coordination and movie titles illustrate the proposed
 * product; they are not claims about the live account or downloaded files.
 */

export type RedesignIconSlug =
    | "redesign"
    | "happy"
    | "blueprint"
    | "keyboard"
    | "release"
    | "analytics"
    | "ci"
    | "qa"
    | "native"
    | "muse"
    | "feedback"
    | "sync"
    | "onboarding"
    | "document"
    | "movies"
    | "inbox"
    | "team";

// Original style-C artwork generated for this storyboard; 40px sources paint
// at 20 CSS px, with no tile or framing. Masters remain outside the package.
// One explicit registry owns the relationship between each entity and its mark.
// Slugs do not derive from entity titles or backend shapes.
export const redesignMarks: Record<
    RedesignIconSlug,
    { icon: IconName; imageMark?: { src: string } }
> = {
    redesign: { icon: "edit", imageMark: { src: redesignMark } },
    happy: { icon: "spark", imageMark: { src: happyMark } },
    blueprint: { icon: "edit", imageMark: { src: blueprintMark } },
    keyboard: { icon: "code", imageMark: { src: keyboardMark } },
    release: { icon: "package", imageMark: { src: releaseMark } },
    analytics: { icon: "zap", imageMark: { src: analyticsMark } },
    ci: { icon: "check-circle", imageMark: { src: ciMark } },
    qa: { icon: "shield", imageMark: { src: qaMark } },
    native: { icon: "mobile", imageMark: { src: nativeMark } },
    muse: { icon: "search", imageMark: { src: museMark } },
    feedback: { icon: "doc", imageMark: { src: documentMark } },
    sync: { icon: "chat", imageMark: { src: syncMark } },
    onboarding: { icon: "spark", imageMark: { src: onboardingMark } },
    document: { icon: "doc", imageMark: { src: documentMark } },
    movies: { icon: "play", imageMark: { src: moviesMark } },
    inbox: { icon: "inbox", imageMark: { src: inboxMark } },
    team: { icon: "users" },
};

export const redesignConnections: readonly ConnectionShellItem[] = [
    { id: "kirill-mac", label: "Kirill", local: true, status: "connected" },
    { id: "steve", label: "Steve Korshakov", local: false, status: "connected" },
];

export const redesignPrimary: SidebarItem[] = [
    { id: "happy", label: "Happy", kind: "agent", imageMark: { src: happyMark } },
    { id: "feedback", label: "Backlog & feedback", kind: "view", ...redesignMarks.feedback },
];

const work = (
    id: string,
    label: string,
    slug: RedesignIconSlug,
    extra: Partial<Pick<SidebarItem, "depth" | "collapsed" | "unread" | "status">> = {},
): SidebarItem => ({
    id,
    label,
    kind: "view",
    ...redesignMarks[slug],
    activityIndicator: "glyph",
    labelShimmer: false,
    ...extra,
});

export const redesignSections: SidebarSection[] = [
    {
        id: "crew",
        label: "Crew",
        collapsed: false,
        items: [
            work("release-coordinator", "Release Coordinator", "release", { unread: true }),
            work("analytics-watcher", "Analytics Watcher", "analytics"),
            work("ci-watcher", "CI Watcher", "ci"),
            work("qa-tester", "QA Tester", "qa"),
        ],
    },
    {
        id: "desktop-workflow",
        label: "Desktop workflow",
        collapsed: false,
        items: [
            work("redesign", "Desktop redesign", "redesign", {
                collapsed: false,
                status: "working",
            }),
            work("shared-chat-sync", "Shared chat sync", "sync", { depth: 1 }),
        ],
    },
    {
        id: "native-reliability",
        label: "Native reliability",
        collapsed: true,
        items: [
            work("native-integration", "Native iOS integration", "native"),
            work("keyboard-audit", "Keyboard drag audit", "keyboard", { depth: 1 }),
        ],
    },
    {
        id: "release-readiness",
        label: "Release readiness",
        action: { icon: "plus", label: "New item in Release readiness", reveal: "hover" },
        collapsed: true,
        items: [
            work("integration-gates", "Current integration gates", "release"),
            work("compute-pools", "Compute pools overview", "document"),
        ],
    },
    {
        id: "onboarding-integrations",
        label: "Onboarding & integrations",
        collapsed: true,
        items: [
            work("onboarding", "Onboarding follow-up", "onboarding"),
            work("muse-integration", "Muse integration", "muse"),
        ],
    },
    {
        id: "today",
        label: "Today",
        collapsed: false,
        items: [
            work("inbox", "Inbox", "inbox"),
            {
                id: "release-note-ideas",
                label: "Release note ideas",
                kind: "view",
                stemCell: { id: "release-note-ideas" },
            },
            {
                id: "shortcut-ideas",
                label: "Keyboard shortcut ideas",
                kind: "view",
                stemCell: { id: "shortcut-ideas" },
            },
        ],
    },
];

export const redesignTabs: TabItem[] = [
    { id: "redesign", label: "Desktop redesign", ...redesignMarks.redesign },
    { id: "draft", label: "Redesign draft", ...redesignMarks.document },
    {
        id: "sidebar-file",
        label: "Sidebar.tsx",
        filePath: "packages/happy-desktop-ui/src/Sidebar.tsx",
    },
];

export const redesignComposer: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "desktop-redesign",
    submission: { status: "idle" },
    text: "",
};

const human = (id: string, text: string): WorkTranscriptRow => ({
    id,
    kind: "message",
    author: "Kirill",
    text,
    own: true,
});
const redesignAuthors = {
    redesign: { name: "Redesign", mark: redesignMarks.redesign.imageMark },
    happy: { name: "Happy", mark: redesignMarks.happy.imageMark },
    release: { name: "Release Coordinator", mark: redesignMarks.release.imageMark },
};
const agent = (
    id: string,
    text: string,
    author: keyof typeof redesignAuthors = "redesign",
): WorkTranscriptRow => ({
    id,
    kind: "message",
    author: redesignAuthors[author].name,
    imageMark: redesignAuthors[author].mark,
    text,
});

export const redesignMorning: readonly WorkTranscriptRow[] = [
    human(
        "morning-1",
        "Act as a scribe for feature/bug reports; preserve nuance, organize them, and detect duplicates without deciding for me.",
    ),
    {
        id: "morning-2",
        kind: "summary",
        label: "Updated Backlog & feedback",
        details: [
            "Sidebar dragging and focused-instance reports recorded.",
            "File-viewer stale-content reports added.",
            "Possible duplicates remain linked for human decisions.",
        ],
    },
    human(
        "morning-3",
        "Improve command-palette preview/focus and shortcuts; unmatched text should route to Chief of Staff.",
    ),
    agent(
        "morning-4",
        "Keep similar reports linked as possible duplicates; leave priority and product decisions to the human.",
        "happy",
    ),
];

export const redesignWorking: readonly WorkTranscriptRow[] = [
    human(
        "work-1",
        "Keep pinned items; drop Recent. Use no files in the sidebar tree, with working, unread, and awaiting-input examples plus a nested subtask.",
    ),
    agent("work-2", "I’ll establish the layout direction, then delegate a blueprint pass."),
    {
        id: "work-3",
        kind: "summary",
        label: "Reviewed 4 screenshots",
        details: [
            "Expanded and collapsed window layouts.",
            "Native traffic-light clearance at renderer zoom.",
            "Light and dark tab-strip overflow.",
        ],
    },
    {
        id: "work-4",
        kind: "summary",
        label: "Checked and committed round 3",
        details: [
            "Round-3 WIP checkpoint: 4e702bba.",
            "The replacement continues from the preserved checkpoint.",
        ],
    },
    {
        id: "work-5",
        kind: "handoff",
        label: "Blueprints: round 4 done",
        details: [
            "Clearer section labels and a static space heading.",
            "Tab-overflow fade and matching session marks.",
            "Typecheck and lint passed; screenshots captured.",
        ],
    },
];

export const redesignReplaced: readonly WorkTranscriptRow[] = [
    human("crash-1", "The blueprint worker has crashed repeatedly; continue with a replacement."),
    {
        id: "crash-2",
        kind: "warning",
        text: "Blueprints stopped after repeated WebSocket 1009 errors. A replacement is continuing from the saved checkpoint.",
    },
    {
        id: "crash-3",
        kind: "summary",
        label: "Preserved round 3 and started a replacement",
        details: [
            "Saved checkpoint 4e702bba.",
            "The replacement resumes the same work; it is not a second project.",
            "Previous attempts stay in History.",
        ],
    },
    {
        id: "crash-4",
        kind: "handoff",
        label: "Replacement: continuing the approved design",
        details: ["Preserve the sidebar and tab details.", "Avoid full-size PNG payloads."],
    },
];

export const redesignLeased: readonly WorkTranscriptRow[] = [
    human(
        "muse-1",
        "Find which Muse integration/product this refers to and how its item icons are selected.",
    ),
    {
        id: "muse-2",
        kind: "summary",
        label: "Inspected Muse’s icon assets",
        details: [
            "Compared candidate Muse/Pablo references.",
            "Inspected the product’s icon path and sample assets.",
            "Checked fixed-size asset files.",
        ],
    },
    {
        id: "muse-3",
        kind: "leased",
        author: "Muse icon research",
        streaming: true,
        text: "The available evidence points to a static icon set, not generated icons.\n\nLikely a fixed SVG/icon library and selector; the observed assets are flat two-tone, around 64 px.\n\nRecommendation is to use a static picker unless product identity is confirmed; confidence is limited.",
        imageMark: redesignMarks.muse.imageMark,
    },
];

export const redesignNative: readonly WorkTranscriptRow[] = [
    human(
        "native-1",
        "Replicate onboarding end to end; settings opens blank, upgrade asks for QR again, and account setup has no back path.",
    ),
    {
        id: "native-2",
        kind: "summary",
        label: "Captured onboarding failures and integration gates",
        details: [
            "Native iOS f010601a: 208 pass, five fail; hosted compilation blocked.",
            "Current integration gates and RN coverage published.",
        ],
    },
    human("native-3", "Close finished subtasks; keep only the active one."),
    human("native-4", "What’s missing, and why are so many subtasks open?"),
];

// Proposed release-day interaction, separate from the historical excerpts above.
export const redesignReleaseQuestion: HappyAgentUserInputRequest = {
    requestId: "release-window",
    questions: [
        {
            id: "window",
            header: "Release window",
            question: "The checks are ready. Start the preview release?",
            required: true,
            multiSelect: false,
            options: [
                {
                    label: "Start preview",
                    description:
                        "Release Coordinator proceeds; Analytics Watcher watches the new build.",
                },
                {
                    label: "Hold",
                    description: "Keep the current preview while we resolve the remaining issue.",
                },
            ],
        },
    ],
};

export const redesignRelease: readonly WorkTranscriptRow[] = [
    agent(
        "release-1",
        "The preview checks are ready. I’ve asked Analytics Watcher to watch startup failures and reconnects on the new build.",
        "release",
    ),
    {
        id: "release-2",
        kind: "handoff",
        label: "Release Coordinator → Analytics Watcher: watch the preview",
        details: [
            "Compare startup failures and reconnects with the previous preview.",
            "Bring a regression back to this conversation.",
        ],
    },
    {
        id: "release-3",
        kind: "summary",
        label: "Checked integration gates and CI",
        details: [
            "CI Watcher has returned the latest check results.",
            "QA Tester is waiting for the team’s next budget window.",
        ],
    },
    { id: "release-4", kind: "question", request: redesignReleaseQuestion },
];

export const redesignActive: readonly WorkFloatyItem[] = [
    {
        id: "blueprints",
        kind: "helper",
        status: "running",
        label: "Blueprints",
        detail: "Continuing the window redesign",
        ...redesignMarks.blueprint,
    },
    {
        id: "muse-research",
        kind: "helper",
        status: "running",
        label: "Muse icon research",
        detail: "Checking the source assets",
        ...redesignMarks.muse,
    },
    { id: "draft", kind: "artifact", label: "Redesign draft", ...redesignMarks.document },
    { id: "feedback", kind: "artifact", label: "Backlog & feedback", ...redesignMarks.feedback },
];

export const redesignHistory: readonly WorkFloatyItem[] = [
    {
        id: "previous-blueprints",
        kind: "helper",
        status: "replaced",
        label: "Previous blueprint attempt",
        detail: "Replaced after WS 1009 · round 3 saved",
        ...redesignMarks.blueprint,
    },
    {
        id: "finished-research",
        kind: "helper",
        status: "complete",
        label: "Muse icon research",
        detail: "Result delivered to the conversation",
        ...redesignMarks.muse,
    },
    {
        id: "round-three",
        kind: "artifact",
        label: "Round-3 checkpoint",
        detail: "4e702bba",
        ...redesignMarks.document,
    },
    {
        id: "keyboard-audit",
        kind: "artifact",
        label: "Keyboard drag audit",
        ...redesignMarks.keyboard,
    },
    { id: "input-audit", kind: "artifact", label: "Input timing audit", ...redesignMarks.document },
    { id: "ios-gate", kind: "artifact", label: "iOS 208-pass gate", ...redesignMarks.document },
];

export const redesignSearch: readonly CommandPaletteResultsSection[] = [
    {
        id: "work",
        rows: [
            {
                id: "redesign",
                kind: "command",
                title: "Desktop redesign",
                meta: "Happy Desktop",
                icon: "edit",
            },
            { id: "draft", kind: "command", title: "Redesign draft", icon: "doc" },
            { id: "feedback", kind: "command", title: "Backlog & feedback", icon: "tasks" },
            {
                id: "sidebar-file",
                kind: "command",
                title: "Sidebar.tsx",
                meta: "happy-desktop-ui / src",
                icon: "code",
            },
        ],
    },
];

const movieSurfaceId = "storyboard-movies" as HappyAgentSurfaceId;
export const redesignMovies: HappyAgentTodoListSnapshot = {
    surfaceId: movieSurfaceId,
    status: "ready",
    completed: [],
    completedShown: false,
    authors: new Map(),
    draft: "",
    active: [
        "Perfect Days",
        "The Grand Budapest Hotel",
        "Dune: Part Two",
        "Past Lives",
        "The Boy and the Heron",
    ].map((text, index) => ({
        id: `movie-${index}` as HappyAgentSurfaceTodoId,
        surfaceId: movieSurfaceId,
        text,
        status: "active",
        orderKey: String(index),
        authorUserId: null,
        createdAt: 1_790_000_000_000,
        updatedAt: 1_790_000_000_000,
        version: `movie-v1-${index}`,
        completedAt: null,
        deletedAt: null,
    })),
};

export const redesignDraft = `# A quieter place to work

Keep Happy and pinned work above one shared space. Group the sidebar around durable crew, milestones and today’s loose tasks.

## Work stays visible

Tasks and their long-lived subtasks stay in the sidebar. Temporary research and failed attempts stay with the conversation. The floaty shows what is active; History keeps the rest.

## One way to start

Make Stuff begins with what you want to do. Context finds the connected project and related work, then the request becomes a task, a list or another useful artifact.
`;

export const redesignCode = `export type SidebarSection = {
    id: string;
    label?: string;
    collapsed?: boolean;
    items: SidebarItem[];
};

// Sections group work. Subtasks indent.
// Temporary helpers stay in the task's History.
const sidebar = {
    treeConnectors: false,
    foldControlPlacement: "trailing",
};`;
