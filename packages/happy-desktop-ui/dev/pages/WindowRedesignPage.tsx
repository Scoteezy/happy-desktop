import { useState, type CSSProperties } from "react";
import {
    AppShell,
    APP_SHELL_PANEL_DEFAULT_WIDTH,
    APP_SHELL_SIDEBAR_DEFAULT_WIDTH,
} from "../../src/AppShell";
import { Button } from "../../src/Button";
import { CodeBlock } from "../../src/CodeBlock";
import { ConnectionShell } from "../../src/ConnectionShell";
import { ConversationView } from "../../src/ConversationView";
import { ScrollArea } from "../../src/Scrollbar";
import { Sidebar } from "../../src/Sidebar";
import { TabbedPane } from "../../src/TabbedPane";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import {
    redesignCode,
    redesignComposer,
    redesignConnections,
    redesignConversation,
    redesignMainTabs,
    redesignPrimary,
    redesignSections,
    redesignSideConversation,
    redesignSideTabs,
} from "./windowRedesignFixtures";

export const componentNumber = "P-021";
const noop = () => undefined;
const composeShortcut = { aria: "Meta+N Meta+T", caps: "⌘N" };
const windows = [
    { width: 1100, height: 760 },
    { width: 720, height: 640 },
    { width: 1440, height: 900 },
] as const;

const screens: readonly RedesignWindowProps[] = [
    { id: "01-fullscreen-expanded", label: "Full screen · expanded", fullScreen: true },
    {
        id: "02-fullscreen-collapsed",
        label: "Full screen · collapsed",
        fullScreen: true,
        collapsed: true,
    },
    { id: "03-macos-expanded", label: "macOS · expanded", phrase: "Build" },
    { id: "04-macos-collapsed", label: "macOS · collapsed", collapsed: true, phrase: "Build" },
    { id: "05-macos-80-percent", label: "macOS · 80% renderer zoom", zoom: 0.8 },
    { id: "06-macos-125-percent", label: "macOS · 125% renderer zoom", zoom: 1.25 },
    {
        id: "07-close-focus",
        label: "Close control · hover overlay",
        fullScreen: true,
        closeFocus: true,
    },
    { id: "08-fullscreen-dark", label: "Full screen · dark", fullScreen: true, dark: true },
];

type RedesignWindowProps = {
    id: string;
    label: string;
    fullScreen?: boolean;
    collapsed?: boolean;
    phrase?: string;
    zoom?: number;
    closeFocus?: boolean;
    dark?: boolean;
};

/** Fixture-only OS decoration: its pixels stay fixed while renderer content zooms. */
function TrafficLights() {
    return (
        <span
            aria-hidden="true"
            style={{
                display: "flex",
                gap: 6,
                position: "absolute",
                left: 14,
                top: 13,
                pointerEvents: "none",
                zIndex: 10,
            }}
        >
            {["--status-error", "--box-warning-border", "--success"].map((token) => (
                <span
                    key={token}
                    style={{
                        display: "flex",
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: `var(${token})`,
                    }}
                />
            ))}
        </span>
    );
}

function RedesignWindow(props: RedesignWindowProps) {
    const [collapsed, setCollapsed] = useState(props.collapsed ?? false);
    const [panelOpen, setPanelOpen] = useState(true);
    const [sections, setSections] = useState(redesignSections);
    const [mainTabs, setMainTabs] = useState(redesignMainTabs);
    const [sideTabs, setSideTabs] = useState(redesignSideTabs);
    const [activeMain, setActiveMain] = useState("workflow-sidebar");
    const [activeSide, setActiveSide] = useState("sidebar-file");
    const [draft, setDraft] = useState("");
    const zoom = props.zoom ?? 1;
    const conversation = (side = false) => (
        <ConversationView
            composer={{
                ...redesignComposer,
                scopeId: side ? "session-sync" : "workflow-sidebar",
                text: side ? "" : draft,
            }}
            composerPlaceholder={
                side ? "Reply to Session Sync Audit…" : "Message Workflow Sidebar…"
            }
            entries={side ? redesignSideConversation : redesignConversation}
            onComposerSend={noop}
            onComposerValueChange={side ? noop : setDraft}
            viewerId="kirill"
        />
    );
    const file = (name: string) => (
        <ScrollArea style={{ flex: 1, minHeight: 0 }}>
            <CodeBlock name={name} text={redesignCode} lineNumbers />
        </ScrollArea>
    );
    return (
        <ThemeScope mode={props.dark ? "dark" : "light"}>
            <div
                style={{
                    display: "flex",
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    overflow: "hidden",
                }}
            >
                <div
                    style={
                        {
                            display: "flex",
                            zoom,
                            width: "100%",
                            height: "100%",
                            flex: "none",
                            "--happy-window-zoom": zoom,
                        } as CSSProperties
                    }
                >
                    <ConnectionShell
                        items={redesignConnections}
                        onSelect={noop}
                        selectedId="kirill-mac"
                        windowControls
                        windowFullScreen={props.fullScreen}
                    >
                        <AppShell
                            connectionRail
                            embedded
                            navigationChrome="integrated"
                            windowControls
                            windowFullScreen={props.fullScreen}
                            sidebarCollapsible
                            sidebarCollapsed={collapsed}
                            onSidebarCollapsedChange={setCollapsed}
                            sidebarDefaultWidth={APP_SHELL_SIDEBAR_DEFAULT_WIDTH}
                            sidebarCollapsedAction={{ label: "New item (⌘N or ⌘T)", onClick: noop }}
                            sidebar={
                                <Sidebar
                                    activeItemId={activeMain}
                                    actions={redesignPrimary}
                                    composeLabel={props.phrase ?? "Make Stuff"}
                                    composeShortcut={composeShortcut}
                                    composeTooltip="New item (⌘N or ⌘T)"
                                    onCompose={noop}
                                    onItemSelect={setActiveMain}
                                    onItemCollapseToggle={(id) =>
                                        setSections(
                                            sections.map((section) => ({
                                                ...section,
                                                items: section.items.map((item) =>
                                                    item.id === id
                                                        ? { ...item, collapsed: !item.collapsed }
                                                        : item,
                                                ),
                                            })),
                                        )
                                    }
                                    sections={sections}
                                />
                            }
                            panelWidth={APP_SHELL_PANEL_DEFAULT_WIDTH}
                            panel={
                                panelOpen ? (
                                    <TabbedPane
                                        activeId={activeSide}
                                        tabs={sideTabs}
                                        tabSizing="content"
                                        overflowFade
                                        closePresentation="overlay"
                                        size="medium"
                                        onSelect={setActiveSide}
                                        onClose={(id) => {
                                            setSideTabs(sideTabs.filter((tab) => tab.id !== id));
                                            if (activeSide === id) setActiveSide("session-sync");
                                        }}
                                    >
                                        {activeSide === "session-sync"
                                            ? conversation(true)
                                            : file(
                                                  activeSide === "tabs-css"
                                                      ? "tabs.css"
                                                      : "Sidebar.tsx",
                                              )}
                                    </TabbedPane>
                                ) : undefined
                            }
                        >
                            <TabbedPane
                                activeId={activeMain}
                                tabs={mainTabs}
                                tabSizing="content"
                                overflowFade
                                closePresentation="overlay"
                                closeRevealedId={props.closeFocus ? "workflow-sidebar" : undefined}
                                size="medium"
                                onSelect={setActiveMain}
                                onClose={(id) => {
                                    setMainTabs(mainTabs.filter((tab) => tab.id !== id));
                                    if (activeMain === id)
                                        setActiveMain(
                                            mainTabs.find((tab) => tab.id !== id)?.id ?? "",
                                        );
                                }}
                                trailing={
                                    <Button
                                        aria-label={
                                            panelOpen
                                                ? "Hide secondary pane"
                                                : "Show secondary pane"
                                        }
                                        icon={panelOpen ? "panel-collapse" : "panel-expand"}
                                        iconOnly
                                        size="small"
                                        variant="ghost"
                                        onClick={() => setPanelOpen(!panelOpen)}
                                    />
                                }
                            >
                                {activeMain === "workflow-sidebar" ||
                                !mainTabs.some((tab) => tab.id === activeMain && tab.filePath)
                                    ? conversation()
                                    : file(
                                          mainTabs.find((tab) => tab.id === activeMain)?.label ??
                                              "ConnectionShell.tsx",
                                      )}
                            </TabbedPane>
                        </AppShell>
                    </ConnectionShell>
                </div>
                {props.fullScreen ? null : <TrafficLights />}
            </div>
        </ThemeScope>
    );
}

export function WindowRedesignPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            title="Window redesign"
            width={1536}
            summary="One shared tab band, a unified sidebar hierarchy, and native window clearance at every renderer zoom. Blueprint fixtures only."
        >
            {windows.map((windowSize) =>
                screens.map((screen) => (
                    <FullScreenSpecimen
                        key={`${screen.id}-${windowSize.width}`}
                        number={screen.id.slice(0, 2)}
                        label={screen.label}
                        detail={`${windowSize.width} × ${windowSize.height} · 40px band · 288px sidebar · 340px secondary pane`}
                        screen={`${screen.id}-${windowSize.width}x${windowSize.height}`}
                        window={windowSize}
                    >
                        <RedesignWindow
                            {...screen}
                            collapsed={
                                screen.zoom !== undefined && windowSize.width === 720
                                    ? true
                                    : screen.collapsed
                            }
                        />
                    </FullScreenSpecimen>
                )),
            )}
        </ComponentPage>
    );
}
