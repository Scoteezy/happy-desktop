import { useState } from "react";
import { AppShell, APP_SHELL_SIDEBAR_DEFAULT_WIDTH } from "../../src/AppShell";
import { ConnectionShell } from "../../src/ConnectionShell";
import { MakeStuffView } from "../../src/MakeStuffView";
import { MarkdownDocument } from "../../src/MarkdownDocument";
import { TabbedPane } from "../../src/TabbedPane";
import { ThemeScope } from "../../src/ThemeScope";
import { WorkTranscript, type WorkTranscriptRow } from "../../src/WorkTranscript";
import { PersonalDaySidebar } from "./PersonalDaySidebar";
import {
    dayFocus,
    dayHappyImage,
    dayPerson,
    dayWaiting,
    dayWork,
    dayWorkIdIs,
    type DayFrame,
    type DayWorkId,
} from "./personalDayFixtures";
import { redesignComposer, redesignConnections } from "./windowRedesignFixtures";

const noop = () => undefined;
const taskCopy: Partial<Record<DayWorkId, { request: string; reply: string }>> = {
    viewer: {
        request: "Check the preview viewer before we move on.",
        reply: "I'm working through the viewer pass. I'll keep the result here with the release work.",
    },
    credentials: {
        request: "Keep credential attachment explicit at the boundary.",
        reply: "I'm checking which credentials the provider needs and where that attachment is declared. The pairing contract question can stay with Happy while this continues.",
    },
    resize: {
        request: "Check what happens when the artifact is resized.",
        reply: "The resize probe is ready to inspect. I'll keep the report with this task so we can compare the result.",
    },
    redesign: {
        request: "Keep my desktop work first. Steve is working on native.",
        reply: "Desktop and agent work stay at the top. Steve's work is folded near the bottom, and nothing moves while you're focused here.",
    },
    port: {
        request: "Replicate onboarding end to end and finish the native settings pages.",
        reply: "I'm continuing the UIKit work. The keyboard investigation and connector remain separate work, with their own results.",
    },
    keyboard: {
        request: "Investigate the keyboard drag delay and compare it with Telegram.",
        reply: "The investigation stays with the preview and keyboard task. I haven't confirmed the cause of the drag delay.",
    },
    connector: {
        request: "Use the new Tailcat pairing API in the native connector.",
        reply: "The connector is waiting on Kirill to confirm the server pairing response. The task remains in your space.",
    },
};

export function PersonalDayWindow({ frame }: { frame: DayFrame }) {
    const person = dayPerson(frame);
    const initialFocus = dayFocus(frame);
    const [space, setSpace] = useState(frame === "browse" ? ("steve" as const) : person);
    const [selected, setSelected] = useState<string>(dayFocus(frame));
    const [taskTab, setTaskTab] = useState<DayWorkId>(
        dayWorkIdIs(initialFocus) ? initialFocus : person === "steve" ? "port" : "redesign",
    );
    const [draft, setDraft] = useState(
        frame === "browse" || frame === "return" ? "Keep the sidebar steady while I work." : "",
    );
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const open = (id: string) => {
        if (dayWorkIdIs(id)) setTaskTab(id);
        setSelected(id);
    };
    const happyMessage = (id: string, text: string): WorkTranscriptRow => ({
        id,
        kind: "message",
        author: "Happy",
        imageMark: dayHappyImage,
        text,
    });
    const coordination: WorkTranscriptRow = {
        id: "pairing-contract",
        kind: "coordination",
        title: "Tailcat pairing contract",
        participants:
            person === "kirill"
                ? "Steve's manager → your manager"
                : "Your manager → Kirill's manager",
        text: "Steve's native connector needs the server pairing response confirmed. It's waiting for Kirill's decision on the credential attachment contract.",
        links: [
            { id: "backend", label: "Open Surfaces backend", onOpen: () => open("backend") },
            { id: "connector", label: "View Steve's connector", onOpen: () => open("connector") },
        ],
    };
    const happyRows: WorkTranscriptRow[] = [
        happyMessage(
            "initial-batch",
            person === "kirill"
                ? "Grouped your desktop and agent work; Steve's native work is folded below."
                : "Kept native work first and folded Kirill's desktop and agent work below.",
        ),
        ...(frame === "K5"
            ? [
                  happyMessage(
                      "finished-batch",
                      "Moved Preview viewer release to Older after you finished it.",
                  ),
              ]
            : []),
        ...(dayWaiting(frame) ? [coordination] : []),
    ];
    const source = dayWorkIdIs(selected) ? dayWork[selected] : undefined;
    const copy = dayWorkIdIs(selected) ? taskCopy[selected] : undefined;
    const taskRows: WorkTranscriptRow[] = copy
        ? [
              {
                  id: "request",
                  kind: "message",
                  author: source?.owner === "steve" ? "Steve" : "Kirill",
                  own: true,
                  text: copy.request,
              },
              happyMessage("progress", copy.reply),
              ...(selected === "connector" ? [coordination] : []),
          ]
        : [
              happyMessage(
                  "context",
                  "This work stays where you left it. Open its result or continue the conversation here.",
              ),
          ];
    const composer = {
        composer: { ...redesignComposer, text: draft },
        onComposerValueChange: setDraft,
        onComposerSend: () => setDraft(""),
        composerPlaceholder:
            selected === "happy" ? "Message Happy…" : `Message ${source?.label ?? "Happy"}…`,
        composerFocusOnType: false,
    };
    const content =
        selected === "new" ? (
            <MakeStuffView
                stage={{
                    kind: "request",
                    id: `new-${person}-work`,
                    placement: "automatic",
                    composer,
                }}
            />
        ) : selected === "plans" ? (
            <MarkdownDocument
                text={
                    "# Desktop master plans\n\nThe sidebar is a living, personal view of the work. It groups related work into flat sections without making a folder hierarchy.\n\n## Keep the work steady\n\nWorking, unread, and waiting states update in place. Happy can organize a batch when you switch focus or pause, then explain the change in one line.\n\n## See the team\n\nSteve's native work remains visible near the bottom. Browse his space to understand its full context, while keeping your own Happy and drafts."
                }
            />
        ) : selected === "ultralist" ? (
            <MarkdownDocument
                text={
                    "# UltraList engine docs\n\nLibrary documentation stays with Steve's native work.\n\n## Keyboard and content movement\n\nThe iOS investigation compares keyboard movement and list behavior. The drag delay remains unconfirmed.\n\n## Related work\n\nNative UIKit integration and the Tailcat connector remain separate tasks. The connector's pairing-contract decision is waiting on Kirill."
                }
            />
        ) : selected === "native" ? (
            <MarkdownDocument
                text={
                    "# iOS & UltraView\n\nB1 remains blocked: 58 regressions against clean main.\n\nThe fallback fix is verified but unshipped. The cause of the keyboard drag delay is still unconfirmed.\n\n## Keep the blockers separate\n\nThis regression investigation belongs to native reliability. The connector's proposed pairing-contract decision is a separate piece of work."
                }
            />
        ) : (
            <WorkTranscript
                rows={selected === "happy" ? happyRows : taskRows}
                composer={composer}
            />
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
                    selectedId={person === "kirill" ? "kirill-mac" : "steve"}
                    onSelect={noop}
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
                        sidebarCollapsedAction={{
                            label: "Make Stuff",
                            onClick: () => {
                                setSpace(person);
                                open("new");
                            },
                        }}
                        sidebar={
                            <PersonalDaySidebar
                                frame={frame}
                                activeId={selected}
                                space={space}
                                onSpaceChange={setSpace}
                                onSelect={open}
                                onOrganize={(label) => {
                                    open("happy");
                                    setDraft(`Organize ${label} with its related work.`);
                                }}
                            />
                        }
                    >
                        <TabbedPane
                            tabs={[
                                { id: "happy", label: "Happy", imageMark: dayHappyImage },
                                {
                                    id: taskTab,
                                    label: dayWork[taskTab].label,
                                    imageMark: { src: dayWork[taskTab].image },
                                },
                                ...(selected === "new" ? [{ id: "new", label: "New" }] : []),
                            ]}
                            activeId={selected}
                            onSelect={open}
                            tabSizing="content"
                            overflowFade
                            size="medium"
                        >
                            {content}
                        </TabbedPane>
                    </AppShell>
                </ConnectionShell>
            </div>
        </ThemeScope>
    );
}
