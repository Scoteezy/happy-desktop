import type { SidebarItem, SidebarSection } from "../../src/Sidebar";
import android from "../../src/assets/sidebar-icons/android@40.png";
import api from "../../src/assets/sidebar-icons/api@40.png";
import appStore from "../../src/assets/sidebar-icons/app-store@40.png";
import backend from "../../src/assets/sidebar-icons/backend@40.png";
import build from "../../src/assets/sidebar-icons/build@40.png";
import codeReview from "../../src/assets/sidebar-icons/code-review@40.png";
import debugging from "../../src/assets/sidebar-icons/debugging@40.png";
import deploy from "../../src/assets/sidebar-icons/deploy@40.png";
import designSystem from "../../src/assets/sidebar-icons/design-system@40.png";
import docs from "../../src/assets/sidebar-icons/docs@40.png";
import frontend from "../../src/assets/sidebar-icons/frontend@40.png";
import hotfix from "../../src/assets/sidebar-icons/hotfix@40.png";
import monitoring from "../../src/assets/sidebar-icons/monitoring@40.png";
import roadmap from "../../src/assets/sidebar-icons/roadmap@40.png";
import secrets from "../../src/assets/sidebar-icons/secrets@40.png";
import support from "../../src/assets/sidebar-icons/support@40.png";
import swift from "../../src/assets/sidebar-icons/swift@40.png";
import team from "../../src/assets/sidebar-icons/team@40.png";
import happy from "../../src/assets/sidebar-icons/happy@40.png";
import redesign from "../../src/assets/sidebar-icons/desktop-redesign@40.png";
import blueprint from "../../src/assets/sidebar-icons/blueprint@40.png";
import muse from "../../src/assets/sidebar-icons/muse-icon-research@40.png";
import native from "../../src/assets/sidebar-icons/native-ios-integration@40.png";
import keyboard from "../../src/assets/sidebar-icons/keyboard-audit@40.png";
import inbox from "../../src/assets/sidebar-icons/inbox@40.png";
import ci from "../../src/assets/sidebar-icons/ci-watcher@40.png";
import release from "../../src/assets/sidebar-icons/release-coordinator@40.png";

export type DayPerson = "kirill" | "steve";
export type DayMoment = "K1" | "K2" | "K3" | "K4" | "K5" | "S1" | "S2" | "S3" | "S4";
export type DayFrame = DayMoment | "exchange" | "inline" | "batch-note" | "reply";
type WorkSource = {
    label: string;
    sourceId: string;
    owner: DayPerson | "shared";
    type: "task" | "bot" | "todo";
    image: string;
};

// Explicit projection of the approved 109-row research matrix. Titles and IDs
// are real fixture entries. Running/focus/completion/dependency states below
// are staged; filesystem update times never assert a task's start or finish.
export const dayWork = {
    redesign: {
        label: "Desktop redesign",
        sourceId: "task:task_52",
        owner: "kirill",
        type: "task",
        image: redesign,
    },
    icons: {
        label: "Favicon & icon audit",
        sourceId: "task:task_59",
        owner: "kirill",
        type: "task",
        image: designSystem,
    },
    resize: {
        label: "Artifact resize probe",
        sourceId: "task:task_41",
        owner: "kirill",
        type: "task",
        image: frontend,
    },
    drag: {
        label: "Sidebar drag fix",
        sourceId: "task:task_53",
        owner: "kirill",
        type: "task",
        image: hotfix,
    },
    plans: {
        label: "Desktop master plans",
        sourceId: "task:task_43",
        owner: "kirill",
        type: "task",
        image: roadmap,
    },
    blueprint: {
        label: "Blueprint replacement",
        sourceId: "sub:blueprint-replacement",
        owner: "kirill",
        type: "task",
        image: blueprint,
    },
    workflow: {
        label: "Workflow reimagined",
        sourceId: "bot:reimagine_the_whole_workflow",
        owner: "kirill",
        type: "bot",
        image: roadmap,
    },
    theme: {
        label: "Light theme pass",
        sourceId: "bot:slopus_happy_on_light_theme",
        owner: "kirill",
        type: "bot",
        image: designSystem,
    },
    credentials: {
        label: "Provider credential helper",
        sourceId: "task:task_58",
        owner: "kirill",
        type: "task",
        image: secrets,
    },
    backend: {
        label: "Surfaces backend",
        sourceId: "task:task_31",
        owner: "kirill",
        type: "task",
        image: backend,
    },
    resume: {
        label: "Reply-on-resume audit",
        sourceId: "task:task_49",
        owner: "kirill",
        type: "task",
        image: debugging,
    },
    browser: {
        label: "Remote browser preview",
        sourceId: "bot:remote_browser_localhost",
        owner: "kirill",
        type: "bot",
        image: frontend,
    },
    peers: {
        label: "Peer messaging review",
        sourceId: "task:task_29",
        owner: "kirill",
        type: "task",
        image: team,
    },
    viewer: {
        label: "Preview viewer release",
        sourceId: "task:task_57",
        owner: "kirill",
        type: "task",
        image: deploy,
    },
    ci: {
        label: "CI time watcher",
        sourceId: "bot:why_the_fuck_ci_takes_1hr",
        owner: "kirill",
        type: "bot",
        image: ci,
    },
    release: {
        label: "Release 1 coordinator",
        sourceId: "bot:release_1_happy",
        owner: "kirill",
        type: "bot",
        image: release,
    },
    inbox: {
        label: "Inbox",
        sourceId: "surface:l5jpsdeoy87k22kbeevao0xn",
        owner: "shared",
        type: "todo",
        image: inbox,
    },
    backlog: {
        label: "Backlog scribe",
        sourceId: "bot:todo_dump",
        owner: "shared",
        type: "bot",
        image: roadmap,
    },
    native: {
        label: "iOS & UltraView",
        sourceId: "bot:happy_ios_and_ultraview",
        owner: "steve",
        type: "bot",
        image: native,
    },
    port: {
        label: "Native iOS UIKit port",
        sourceId: "task:task_20",
        owner: "steve",
        type: "task",
        image: native,
    },
    keyboard: {
        label: "iOS preview + keyboard",
        sourceId: "task:task_42",
        owner: "steve",
        type: "task",
        image: keyboard,
    },
    connector: {
        label: "Tailcat connector",
        sourceId: "task:task_50",
        owner: "steve",
        type: "task",
        image: api,
    },
    ultralist: {
        label: "UltraList engine docs",
        sourceId: "task:task_46",
        owner: "steve",
        type: "task",
        image: docs,
    },
    nativeList: {
        label: "Happy Native",
        sourceId: "surface:ymva9cb8j0014l0pxjol12ed",
        owner: "steve",
        type: "todo",
        image: appStore,
    },
    android: {
        label: "Happy Native Android",
        sourceId: "surface:xmvacry7f001wl87jtsq48x8",
        owner: "steve",
        type: "todo",
        image: android,
    },
    nativeCi: {
        label: "iOS CI on Mac",
        sourceId: "task:task_38",
        owner: "steve",
        type: "task",
        image: build,
    },
    blueprintOld: {
        label: "Blueprint round 3",
        sourceId: "sub:blueprint-r3",
        owner: "kirill",
        type: "task",
        image: blueprint,
    },
    muse: {
        label: "Muse icon research",
        sourceId: "sub:muse-icons",
        owner: "kirill",
        type: "task",
        image: muse,
    },
    study: {
        label: "t3code study",
        sourceId: "task:task_12",
        owner: "kirill",
        type: "task",
        image: codeReview,
    },
    nativeStatus: {
        label: "iOS rewrite status check",
        sourceId: "bot:status_ios_native_rewrite",
        owner: "steve",
        type: "bot",
        image: monitoring,
    },
    nativeStatusOld: {
        label: "iOS rewrite status check (2)",
        sourceId: "bot:give_me_status_of_happy_ios_native_rewrite_it_should_have_added",
        owner: "steve",
        type: "bot",
        image: monitoring,
    },
    nativeSupport: {
        label: "Tasks iOS support",
        sourceId: "bot:tasks_ios_support",
        owner: "steve",
        type: "bot",
        image: support,
    },
    nativeTasks: {
        label: "Tasks on iOS",
        sourceId: "bot:tasks_on_ios",
        owner: "steve",
        type: "bot",
        image: native,
    },
    androidMap: {
        label: "Android feature map",
        sourceId: "task:task_45",
        owner: "steve",
        type: "task",
        image: android,
    },
    swift: {
        label: "Tailcat Swift port",
        sourceId: "task:task_44",
        owner: "steve",
        type: "task",
        image: swift,
    },
} as const satisfies Record<string, WorkSource>;
export type DayWorkId = keyof typeof dayWork;
export function dayWorkIdIs(id: string): id is DayWorkId {
    return Object.hasOwn(dayWork, id);
}
export const dayHappyImage = { src: happy };

export const dayFrameDetails = [
    {
        id: "12a-k1",
        scene: "K1",
        label: "Kirill · 06:10 · settle into release work",
        detail: "Real: viewer activity 06:09. Staged: focus and initial grouping; one Happy note.",
    },
    {
        id: "12b-k3",
        scene: "K3",
        label: "Kirill · 09:18 · status changes in place",
        detail: "Real: credentials activity 09:16. Staged: focus and Steve's dependency; no reorganization.",
    },
    {
        id: "12c-k4",
        scene: "K4",
        label: "Kirill · 10:05 · look further without moving work",
        detail: "Inspection branch: user opens Desktop tail and Steve inline, then scrolls down. Only the connector and keyboard work are shown; other sections retain K3 disclosure.",
    },
    {
        id: "12d-k5",
        scene: "K5",
        label: "Kirill · 10:29 · one quiet batch",
        detail: "Staged: user closes the two inspection disclosures. Viewer alone moves to closed Older; Desktop redesign stays focused. Happy has the one-line note.",
    },
    {
        id: "12d2-k5-note",
        scene: "batch-note",
        label: "Kirill · opens Happy after the batch",
        detail: "Separate user navigation from K5 to read the note. The batch itself never selected Happy or opened Older.",
    },
    {
        id: "12e-s1",
        scene: "S1",
        label: "Steve · 03:44 · native comes first",
        detail: "Real: UIKit activity 03:43. Staged: personal projection, focus, initial grouping and Happy note.",
    },
    {
        id: "12f-s3",
        scene: "S3",
        label: "Steve · 09:18 · waiting on Kirill",
        detail: "Real: connector work 08:01; request for Tailcat API. Staged: contract dependency; rows stay put.",
    },
    {
        id: "12g-exchange",
        scene: "exchange",
        label: "Happy · Tailcat pairing contract",
        detail: "Staged 09:18 question; answer through the normal composer. Source link opens the backend, never the current connector.",
    },
    {
        id: "12h-inline",
        scene: "inline",
        label: "Kirill · Steve expanded inline",
        detail: "09:18 inspection branch: the user opens Steve's two relevant items. Credential helper, its draft and the rest of Kirill's sidebar remain in place. No foreign tail or separate browse view.",
    },
] as const;

export function dayAfterBatch(frame: DayFrame) {
    return frame === "K5" || frame === "batch-note";
}

export function dayPerson(frame: DayFrame): DayPerson {
    return frame === "S1" || frame === "S2" || frame === "S3" || frame === "S4"
        ? "steve"
        : "kirill";
}
export function dayFocus(frame: DayFrame): DayWorkId | "happy" {
    switch (frame) {
        case "K1":
            return "viewer";
        case "K2":
            return "resize";
        case "K3":
        case "inline":
            return "credentials";
        case "K4":
        case "K5":
            return "redesign";
        case "exchange":
        case "reply":
        case "batch-note":
            return "happy";
        case "S1":
            return "port";
        case "S2":
            return "keyboard";
        case "S3":
            return "connector";
        case "S4":
            return "ultralist";
    }
}
export function dayWaiting(frame: DayFrame) {
    return frame === "K3" || frame === "S3" || frame === "exchange" || frame === "inline";
}

/** Recent focus is explicit storyboard content, never inferred from row status. */
export function dayRecentFocus(person: DayPerson, frame: DayFrame): string {
    if (person === "kirill") {
        if (frame === "S1") return "Desktop redesign, sidebar icons";
        if (frame === "S2") return "Preview viewer release, desktop redesign";
        if (frame === "S3") return "Credential helper, artifact resize probe";
        return "Desktop redesign, sidebar icons, master plans";
    }
    if (frame === "K1") return "UIKit onboarding + settings";
    if (
        frame === "K2" ||
        frame === "K3" ||
        frame === "inline" ||
        frame === "exchange" ||
        frame === "reply"
    )
        return "iOS keyboard + UIKit port, Tailcat pairing";
    if (frame === "K4") return "iOS regressions, UIKit port, Tailcat pairing";
    return "iOS keyboard + UIKit port, Tailcat pairing, UltraList docs";
}

export function dayRow(id: DayWorkId, frame: DayFrame, resolved = !dayWaiting(frame)): SidebarItem {
    const waiting = !resolved;
    return {
        id,
        label: dayWork[id].label,
        kind: "view",
        imageMark: { src: dayWork[id].image },
        activityIndicator: "glyph",
        labelShimmer: false,
        trailingWidth: id === "connector" ? 112 : id === "native" ? 64 : 18,
        workingIndicator: "circle",
        status:
            id === "connector" && waiting
                ? dayPerson(frame) === "kirill"
                    ? "awaitingInput"
                    : "waiting"
                : (id === "connector" &&
                        resolved &&
                        frame !== "K1" &&
                        frame !== "K2" &&
                        frame !== "S1" &&
                        frame !== "S2") ||
                    (id === dayFocus(frame) && id !== "viewer")
                  ? "working"
                  : undefined,
        meta:
            id === "connector" && waiting
                ? dayPerson(frame) === "kirill"
                    ? "Waiting on you"
                    : "Waiting on Kirill"
                : id === "native" && (frame === "K4" || frame === "K5" || frame === "S4")
                  ? "Blocked"
                  : undefined,
    };
}

const desktop: DayWorkId[] = [
    "redesign",
    "icons",
    "resize",
    "drag",
    "plans",
    "blueprint",
    "workflow",
    "theme",
];
const platform: DayWorkId[] = ["credentials", "backend", "resume", "browser", "peers"];
// Cross-area relevance, not a second copy of the colleague's own sidebar.
const steveRelevant: DayWorkId[] = ["connector", "keyboard"];
const kirillRelevant: DayWorkId[] = ["backend", "credentials"];

export function daySections(person: DayPerson, frame: DayFrame): SidebarSection[] {
    const rows = (ids: DayWorkId[]) => ids.map((id) => dayRow(id, frame));
    const shared: SidebarSection = {
        id: "shared",
        label: "Shared",
        context: person === "kirill" ? "with Steve" : "with Kirill",
        items: rows(["inbox", "backlog"]),
        collapsed: false,
        tail: { visibleCount: 1, expanded: false },
    };
    if (person === "steve")
        return [
            {
                id: "native",
                label: "Native",
                items: rows(["native", "port", "keyboard", "nativeList", "android"]),
                collapsed: false,
                tail: { visibleCount: 3, expanded: false },
            },
            {
                id: "libraries",
                label: "Libraries",
                items: rows(["connector", "ultralist"]),
                collapsed: false,
            },
            {
                id: "release",
                label: "Release",
                items: rows(["nativeCi"]),
                collapsed: false,
            },
            shared,
            {
                id: "kirill-preview",
                label: "Kirill",
                recentFocus: dayRecentFocus("kirill", frame),
                headingDisclosure: true,
                items: rows(kirillRelevant).map((row) => ({ ...row, reorderable: false })),
                collapsed: true,
            },
            {
                id: "older",
                label: "Older",
                items: rows([
                    "nativeStatus",
                    "nativeStatusOld",
                    "nativeSupport",
                    "nativeTasks",
                    "androidMap",
                    "swift",
                ]),
                collapsed: true,
            },
        ];
    return [
        {
            id: "desktop",
            label: "Desktop",
            items: rows(desktop),
            collapsed: false,
            tail: { visibleCount: 3, expanded: frame === "K4" },
        },
        {
            id: "platform",
            label: "Agent platform",
            items: rows(platform),
            collapsed: false,
            tail: { visibleCount: 3, expanded: false },
        },
        {
            id: "release",
            label: "Release",
            items: rows(dayAfterBatch(frame) ? ["ci", "release"] : ["viewer", "ci", "release"]),
            collapsed: false,
            tail: { visibleCount: 2, expanded: false },
        },
        shared,
        {
            id: "steve-preview",
            label: "Steve",
            recentFocus: dayRecentFocus("steve", frame),
            headingDisclosure: true,
            attentionCount: dayWaiting(frame) ? 1 : undefined,
            items: rows(steveRelevant).map((row) => ({ ...row, reorderable: false })),
            collapsed: frame !== "K4" && frame !== "inline",
        },
        {
            id: "older",
            label: "Older",
            items: rows(
                dayAfterBatch(frame)
                    ? ["viewer", "blueprintOld", "muse", "study"]
                    : ["blueprintOld", "muse", "study"],
            ),
            collapsed: true,
            tail: { visibleCount: 1, expanded: false },
        },
    ];
}
