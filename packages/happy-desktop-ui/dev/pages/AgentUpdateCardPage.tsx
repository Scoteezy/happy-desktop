import { AgentUpdateCard, type AgentUpdateCardView } from "../../src/AgentUpdateCard";
import { Composer } from "../../src/Composer";
import { Sidebar } from "../../src/Sidebar";
import { SidebarAgentUpdate } from "../../src/SidebarAgentUpdate";
import { SidebarFooter } from "../../src/SidebarFooter";
import { SidebarUpdateAction } from "../../src/SidebarUpdateAction";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-288";

const noop = () => undefined;

const AGENTS = [
    { id: "a1", name: "Release bot", onSelect: noop, stage: "tools" },
    { id: "a2", name: "update-progress-blueprints", onSelect: noop, stage: "inference" },
    { id: "a3", name: "release-preview-4", onSelect: noop, stage: "compaction" },
    { id: "a4", name: "inbox-free-text-replies", onSelect: noop, stage: "inference" },
    { id: "a5", name: "sandbox-network-proxy", onSelect: noop, stage: "tools" },
] as const;

const PHASES: readonly {
    readonly label: string;
    readonly detail: string;
    readonly view: AgentUpdateCardView;
}[] = [
    {
        detail: "Every agent the daemon is waiting on fits: name · status, each opening its chat",
        label: "Finishing work · 3 agents",
        view: {
            agentCount: 3,
            agents: AGENTS.slice(0, 3),
            fraction: 0.4,
            kind: "draining",
            operationCount: 0,
        },
    },
    {
        detail: "More than fit: two named, the last line counts the rest",
        label: "Finishing work · 5 agents",
        view: { agentCount: 5, agents: AGENTS, kind: "draining", operationCount: 0 },
    },
    {
        detail: "Only internal workers are left: said once, never counted as +N more",
        label: "Finishing work · background only",
        view: { agentCount: 0, agents: [], kind: "draining", operationCount: 2 },
    },
    {
        detail: "Drained, the daemon is asked to exit",
        label: "Shutting down",
        view: { kind: "stopping", killed: false },
    },
    { detail: "The new version is coming up", label: "Starting", view: { kind: "starting" } },
    {
        detail: "The window catches up with the new daemon",
        label: "Reconnecting",
        view: { kind: "reconnecting" },
    },
    {
        detail: "Measured by this window from the update's start; clears itself after 3 seconds",
        label: "Updated",
        view: { kind: "done", tookMs: 102_000 },
    },
    {
        detail: "A window that arrived mid-update has no start to measure from and says nothing",
        label: "Updated · unmeasured",
        view: { kind: "done" },
    },
    {
        detail: "A failed drain leaves the old daemon serving · one way out besides retrying",
        label: "Failed while finishing work",
        view: {
            failedAt: "draining",
            kind: "failed",
            message: "Happy Agent was still finishing 2 agents after 15 minutes.",
        },
    },
];

export function AgentUpdateCardPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A Happy Agent update, told on a floating card while the window stays usable. Every phase is the same 380 × 128 frame: the bare looping snail in a 76px box, a title naming the step, three fixed detail lines, and four equal unlabelled tracks. Only the words change. The footer's update slot turns into a slowly spinning sync button while the update runs and toggles the card; once the update is cleared, the slot is empty again."
            title="Agent update card"
        >
            <Specimen
                detail="Every phase in the one frame · the snail is mounted once per update and loops until it finishes or fails"
                label="Phases"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "24px" }}>
                    {PHASES.map((phase, index) => (
                        <div
                            data-screen={`1-${String(index + 1)}-${phase.label.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`}
                            key={phase.label}
                            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                        >
                            <AgentUpdateCard onCollapse={noop} view={phase.view} />
                            <DimensionRule label={`${phase.label} · ${phase.detail}`} />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="Try again · Ask Chief of Staff while the Chief of Staff can be reached; only Try again when it cannot, rather than a link that goes nowhere"
                label="Failure actions"
                number="02"
                stage="surface"
            >
                <div
                    data-screen="2-failure-actions"
                    style={{ display: "flex", flexWrap: "wrap", gap: "24px", padding: "4px" }}
                >
                    <AgentUpdateCard
                        onChiefOfStaffAsk={noop}
                        onCollapse={noop}
                        onRetry={noop}
                        view={{
                            failedAt: "draining",
                            kind: "failed",
                            message: "Happy Agent refused to drain.",
                        }}
                    />
                    <AgentUpdateCard
                        onCollapse={noop}
                        onRetry={noop}
                        view={{
                            failedAt: "starting",
                            kind: "failed",
                            message: "The new version did not start in time.",
                        }}
                    />
                    <AgentUpdateCard
                        chiefOfStaffPending
                        onChiefOfStaffAsk={noop}
                        onCollapse={noop}
                        onRetry={noop}
                        view={{
                            failedAt: "reconnecting",
                            kind: "failed",
                            message: "Happy Agent did not answer after it started.",
                        }}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="Before: the orange update mark · during: the sync button, pressed while the card is open, its left edge 12px in and 8px above the footer · folded: the sync button alone, still turning · after: the slot is empty"
                label="Footer lifecycle"
                number="03"
                stage="app"
            >
                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "24px",
                        alignItems: "flex-end",
                    }}
                >
                    {(
                        [
                            { key: "before", slot: "offer" },
                            { key: "open", slot: "open" },
                            { key: "folded", slot: "folded" },
                            { key: "after", slot: "none" },
                        ] as const
                    ).map((state) => (
                        <div
                            data-screen={`3-footer-${state.key}`}
                            key={state.key}
                            style={{ display: "flex", height: "260px", width: "420px" }}
                        >
                            <div
                                style={{
                                    border: "1px solid var(--divider)",
                                    display: "flex",
                                    width: "300px",
                                }}
                            >
                                <Sidebar
                                    activeItemId=""
                                    footer={
                                        <SidebarFooter
                                            actions={
                                                state.slot === "offer" ? (
                                                    <SidebarUpdateAction
                                                        action="install"
                                                        onAction={noop}
                                                        status="downloaded"
                                                        subject="happyAgent"
                                                        version="0.4.2"
                                                    />
                                                ) : state.slot === "none" ? undefined : (
                                                    <SidebarAgentUpdate
                                                        expanded={state.slot === "open"}
                                                        onCollapse={noop}
                                                        onToggle={noop}
                                                        view={{ kind: "starting" }}
                                                    />
                                                )
                                            }
                                            appearance="dark"
                                            onAppearanceToggle={noop}
                                            onSettingsOpen={noop}
                                        />
                                    }
                                    onCompose={noop}
                                    onItemSelect={noop}
                                    sections={[]}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="Default 288px sidebar beside a real composer: where the card would cover the composer it rises until it clears the composer's top edge by 8px; it may overlap the transcript, never the input"
                label="Clears the composer"
                number="04"
                stage="app"
            >
                <div
                    data-screen="4-clears-composer"
                    style={{ display: "flex", height: "420px", width: "900px" }}
                >
                    <div
                        style={{
                            border: "1px solid var(--divider)",
                            display: "flex",
                            width: "288px",
                        }}
                    >
                        <Sidebar
                            activeItemId=""
                            footer={
                                <SidebarFooter
                                    actions={
                                        <SidebarAgentUpdate
                                            expanded
                                            onCollapse={noop}
                                            onToggle={noop}
                                            view={{
                                                agentCount: 2,
                                                agents: AGENTS.slice(0, 2),
                                                kind: "draining",
                                                operationCount: 0,
                                            }}
                                        />
                                    }
                                    appearance="dark"
                                    onAppearanceToggle={noop}
                                    onSettingsOpen={noop}
                                />
                            }
                            onCompose={noop}
                            onItemSelect={noop}
                            sections={[]}
                        />
                    </div>
                    <div
                        style={{
                            display: "flex",
                            flex: "1 1 auto",
                            flexDirection: "column",
                            justifyContent: "flex-end",
                            padding: "12px",
                        }}
                    >
                        <Composer
                            mentions={[]}
                            onSend={noop}
                            onValueChange={noop}
                            placeholder="Message Happy…"
                            value="Keep the waveform quiet while I am reading another session."
                        />
                    </div>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
