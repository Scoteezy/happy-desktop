import type { ComposerSnapshot, ConversationMessageEntry } from "happy-desktop-state";
import type { ConnectionShellItem } from "../../src/ConnectionShell";
import type { SidebarItem, SidebarSection } from "../../src/Sidebar";
import type { TabItem } from "../../src/Tabs";

export const redesignConnections: readonly ConnectionShellItem[] = [
    { id: "kirill-mac", label: "Kirill", local: true, status: "connected" },
    { id: "steve", label: "Steve Korshakov", local: false, status: "connected" },
];

export const redesignPrimary: SidebarItem[] = [
    { id: "happy", label: "Happy", kind: "agent", avatarId: "happy-primary" },
];

const chat = (id: string, label: string, depth = 1): SidebarItem => ({
    id,
    label,
    depth,
    kind: "agent",
    avatarId: id,
    activityIndicator: "glyph",
});
const folder = (id: string, label: string, collapsed = true): SidebarItem => ({
    id,
    label,
    kind: "folder",
    collapsed,
});

export const redesignSections: SidebarSection[] = [
    {
        id: "pinned",
        label: "Pinned",
        items: [
            {
                ...chat("windows-release", "Windows Release Checks", 0),
                status: "working",
                labelShimmer: false,
            },
            {
                id: "release-calendar-pinned",
                label: "Release Calendar",
                kind: "view",
                icon: "calendar",
            },
            { id: "desktop-demo", label: "Desktop Demo", kind: "view", icon: "globe" },
        ],
    },
    {
        id: "space",
        spaceHeading: { avatarId: "happy-team", label: "Happy Team" },
        headingOnly: true,
        items: [],
    },
    {
        id: "projects",
        label: "Projects",
        items: [
            folder("desktop", "Happy Desktop", false),
            { ...chat("workflow-sidebar", "Workflow Sidebar"), collapsed: false },
            {
                ...chat("sidebar-audit", "Sidebar Tree Audit", 2),
                status: "working",
                labelShimmer: false,
            },
            {
                id: "workflow-proposal",
                label: "Workflow Proposal",
                kind: "view",
                icon: "doc",
                depth: 1,
            },
            { ...chat("transcript-reliability", "Transcript Reliability"), unread: true },
            folder("agent", "Happy Agent"),
            chat("windows-sandbox", "Windows Sandbox"),
            chat("session-sync", "Session Sync Audit"),
            { id: "release-tiers", label: "Release Tiers", kind: "view", icon: "doc", depth: 1 },
            folder("mobile", "Happy Mobile"),
            chat("ios-composer", "iOS Composer"),
            chat("model-picker", "Model Picker"),
            folder("ultraview", "UltraView"),
            chat("list-motion", "List Motion"),
            { id: "swipe-demo", label: "Swipe Demo", kind: "view", icon: "globe", depth: 1 },
            folder("lang", "Happy Lang"),
            chat("lean-pipeline", "Lean Pipeline"),
            folder("bit", "Happy Bit"),
            chat("chatgpt-signin", "ChatGPT Sign-in"),
            { id: "auth-review", label: "Auth Review", kind: "view", icon: "doc", depth: 1 },
        ],
    },
    {
        id: "bots",
        label: "Bots",
        items: [
            { ...chat("release-scout", "Release Scout", 0), status: "awaitingInput" },
            chat("ui-reviewer", "UI Reviewer", 0),
            chat("mobile-qa", "Mobile QA", 0),
            chat("docs-keeper", "Docs Keeper", 0),
        ],
    },
    {
        id: "shared",
        label: "Shared",
        items: [
            { id: "inbox", label: "Inbox", kind: "view", icon: "tasks", count: 8 },
            { id: "bugs", label: "Bugs", kind: "view", icon: "tasks", count: 12 },
            { id: "happy-native", label: "Happy Native", kind: "view", icon: "tasks", count: 6 },
            {
                id: "happy-native-android",
                label: "Happy Native Android",
                kind: "view",
                icon: "tasks",
                count: 3,
            },
            { id: "release-calendar", label: "Release Calendar", kind: "view", icon: "calendar" },
        ],
    },
];

export const redesignMainTabs: TabItem[] = [
    { id: "workflow-sidebar", label: "Workflow Sidebar", avatarId: "workflow-sidebar" },
    ...[
        "packages/happy-desktop-ui/src/ConnectionShell.tsx",
        "packages/happy-desktop-ui/src/ConversationView.tsx",
        "packages/happy-desktop-ui/src/HappyAgentCreateSessionPage.tsx",
        "packages/happy-desktop-electron/sources/main/happyAgentRelease.ts",
        "master-plans/08-redesign-draft.md",
    ].map(
        (filePath): TabItem => ({
            id: filePath,
            label: filePath.slice(filePath.lastIndexOf("/") + 1),
            filePath,
        }),
    ),
];

export const redesignSideTabs: TabItem[] = [
    { id: "session-sync", label: "Session Sync Audit", avatarId: "session-sync" },
    {
        id: "sidebar-file",
        label: "Sidebar.tsx",
        filePath: "packages/happy-desktop-ui/src/Sidebar.tsx",
    },
    {
        id: "tabs-css",
        label: "tabs.css",
        filePath: "packages/happy-desktop-ui/src/styles/tabs.css",
    },
];

function message(
    id: string,
    human: boolean,
    text: string,
    sessionId: "workflow-sidebar" | "session-sync" = "workflow-sidebar",
): ConversationMessageEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: sessionId,
            sequence: id,
            changePts: id,
            sender: human
                ? { id: "kirill", displayName: "Kirill", username: "kirill", kind: "human" }
                : {
                      id: sessionId,
                      displayName:
                          sessionId === "session-sync" ? "Session Sync Audit" : "Workflow Sidebar",
                      username: sessionId,
                      sessionId,
                      kind: "agent",
                      agentRole: "default",
                  },
            text,
            generationStatus: "complete",
            attachments: [],
            reactions: [],
            createdAt: "2026-08-18T09:41:00.000Z",
        },
    };
}

export const redesignConversation = [
    message(
        "01",
        true,
        "Keep Happy and pinned items at the top. Projects, chats, and documents should share one tree.",
    ),
    message(
        "02",
        false,
        "The workflow proposal is ready. Sections group without indentation; folders keep their nested items.\n\nHappy stays above **Happy Team**, alongside your pinned items.",
    ),
    message(
        "03",
        true,
        "Same tabs on both sides. Full file names, less space, and close on hover.",
    ),
    message(
        "04",
        false,
        "Both panes use the same strip. Titles keep their natural width and scroll when needed.\n\nThe Sidebar Tree Audit is checking the nested rows. Next: window controls and the collapsed layout.",
    ),
];

export const redesignSideConversation = [
    message(
        "side-01",
        true,
        "Steve and I are checking session sync. What happens when the connection comes back?",
        "session-sync",
    ),
    message(
        "side-02",
        false,
        "The client asks for the missing changes and reconciles them into the current session. The open conversation keeps its scroll position and draft.\n\nI’m checking the reconnect path in the session audit.",
        "session-sync",
    ),
];

export const redesignComposer: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "workflow-sidebar",
    submission: { status: "idle" },
    text: "",
};

export const redesignCode = `import { KeyCap } from "./Badge";
import { Icon } from "./Icon";

export type SidebarSection = {
    id: string;
    label?: string;
    items: SidebarItem[];
};

export type SidebarItem = {
    id: string;
    label: string;
    depth?: number;
    collapsed?: boolean;
};

// Sections group. Folders nest.
const rowHeight = 32;
const rowGap = 2;
const rowIndent = 16;
`;
