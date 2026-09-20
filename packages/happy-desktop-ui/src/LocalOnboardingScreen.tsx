import { type AssistantMarkName } from "./AssistantMark";
import { Button } from "./Button";
import { CopyButton } from "./CopyButton";
import { DesktopMobileSetup, type DesktopMobileSetupStep } from "./DesktopMobileSetup";
import { MenuButton } from "./MenuButton";
import { OnboardingSteps, type OnboardingStage } from "./OnboardingSteps";
import { QRCode } from "./QRCode";
import {
    SetupAssistants,
    type SetupAssistantAction,
    type SetupAssistantEntry,
} from "./SetupAssistants";
import { SetupPage, SetupProgress, type SetupPageProgress } from "./SetupPage";
import { Spinner } from "./Spinner";
import { TextField } from "./TextField";
import type { ThemeMode } from "./ThemeScope";

/** The coding assistants Happy looks for, and nothing beyond them. */
export type LocalOnboardingAssistantId = "claude" | "codex" | "grok";

/**
 * One of them as the machine answered for it: the command is here, or it is
 * not. Whether a command that is here can actually run is the connected Happy Agent's
 * answer rather than the shell's, and the screen showing this carries it.
 */
export interface LocalOnboardingAssistant {
    readonly id: LocalOnboardingAssistantId;
    /** What the daemon proved about the currently configured local credential. */
    readonly authentication: "checking" | "valid" | "invalid" | "error" | "unavailable";
    readonly status: "found" | "missing";
    /** Where the machine keeps it, when it has it. */
    readonly command?: string;
}

/**
 * The Happy Agent archive arriving, while it is arriving. Counted by the
 * process fetching it; absent before the first byte and after the last.
 */
export interface LocalOnboardingDownload {
    readonly receivedBytes: number;
    readonly totalBytes: number;
}

export type LocalOnboardingAgentSetupPhase =
    | { readonly kind: "preparing" }
    | { readonly download?: LocalOnboardingDownload; readonly kind: "downloading" }
    | { readonly kind: "retrying"; readonly message: string }
    | { readonly kind: "ready"; readonly version: string }
    | { readonly kind: "starting" };

export type LocalOnboardingView =
    | { readonly kind: "happy-mobile-desktop"; readonly step: DesktopMobileSetupStep }
    | { readonly kind: "checking"; readonly message?: string }
    | { readonly kind: "node-missing" }
    | {
          readonly kind: "agent-setup";
          readonly message?: string;
          readonly phase: LocalOnboardingAgentSetupPhase;
      }
    | { readonly kind: "connecting" }
    | { readonly kind: "connect-failed"; readonly message: string; readonly retrying: boolean }
    | {
          /** Binary discovery followed by daemon-owned authentication checks. */
          readonly kind: "provider-authentication";
          readonly assistants: readonly LocalOnboardingAssistant[];
          readonly complete: boolean;
          /** A check is running right now, after the first one has settled. */
          readonly refreshing?: boolean;
      }
    | {
          /**
           * Setup, revisited. Nothing is owed here — it exists so the first
           * step of the sequence is somewhere a person can go back to and see
           * what Happy put on their machine.
           */
          readonly kind: "agent-ready";
          readonly version?: string;
          readonly nodeVersion?: string;
      }
    | { readonly kind: "examining" }
    | {
          readonly busy: boolean;
          readonly email: string;
          readonly kind: "profile-required";
          readonly message?: string;
          readonly name: string;
      }
    | { readonly kind: "happy-mobile-checking" }
    | {
          readonly busy: boolean;
          readonly kind: "happy-mobile-offer";
          readonly message?: string;
      }
    | {
          readonly data: string;
          readonly expiresAt: number;
          readonly kind: "happy-mobile-pairing";
      }
    | {
          readonly busy: boolean;
          readonly kind: "happy-mobile-failed";
          readonly message: string;
      }
    | {
          readonly kind: "finishing";
          readonly busy: boolean;
          readonly message?: string;
      }
    | { readonly kind: "project"; readonly busy: boolean; readonly message?: string };

export interface LocalOnboardingScreenProps {
    readonly showSteps?: boolean;
    readonly appearance: ThemeMode;
    readonly view: LocalOnboardingView;
    /** The furthest step setup has reached, for the bar's own drawing. */
    readonly reachedStage?: OnboardingStage;
    onAssistantsContinue(): void;
    onConnectRetry(): void;
    /** Returns to an earlier step. Absent where stepping back is not offered. */
    onStageSelect?(stage: OnboardingStage): void;
    /** Asks for the subscription check now rather than at the next pass. */
    onSubscriptionsRefresh?(): void;
    /** Opens an external page: the host owns how a link leaves the app. */
    onExternalOpen?(url: string): void;
    onHappyMobileConnect(): void;
    onHappyMobileSkip(): void;
    onHappyMobilePlatformSelect?(platform: "ios" | "android"): void;
    onProjectChoose(): void;
    onProjectSetupBack?(): void;
    onProfileNameChange(value: string): void;
    onProfileEmailChange(value: string): void;
    onProfileCreate(): void;
}

/** What a reader is told to run when Happy cannot start their Happy Agent itself. */
const DAEMON_START_COMMAND = "happy-agent start";

/**
 * The download as the button reports it: the counted share and both sizes while
 * an archive is on the way, and an unmeasured wait otherwise.
 *
 * The two ends of a download are genuinely unmeasured rather than zero and one
 * hundred — the release is being looked up, then what arrived is being checked
 * and unpacked — so neither is dressed up as a fraction.
 */
function downloadProgress(download: LocalOnboardingDownload | undefined): SetupPageProgress {
    if (!download || download.totalBytes <= 0) return { kind: "waiting" };
    return {
        detail: `${byteSize(download.receivedBytes)} of ${byteSize(download.totalBytes)}`,
        fraction: download.receivedBytes / download.totalBytes,
        kind: "measured",
    };
}

function agentSetupProgress(phase: LocalOnboardingAgentSetupPhase): SetupPageProgress {
    if (phase.kind === "ready") return { detail: phase.version, fraction: 1, kind: "measured" };
    return phase.kind === "downloading" ? downloadProgress(phase.download) : { kind: "waiting" };
}

function agentSetupProgressLabel(phase: LocalOnboardingAgentSetupPhase): string {
    switch (phase.kind) {
        case "preparing":
            return "Preparing download…";
        case "downloading":
            return "Downloading Happy Agent…";
        case "retrying":
            return "Retrying automatically…";
        case "ready":
            return "Starting Happy Agent…";
        case "starting":
            return "Waiting for Happy Agent…";
    }
}

function agentSetupCopy(
    phase: LocalOnboardingAgentSetupPhase,
    message: string | undefined,
): string {
    switch (phase.kind) {
        case "retrying":
            return `${phase.message} Happy will retry the download automatically.`;
        case "ready":
            return message ?? "Happy Agent is downloaded and starting automatically.";
        case "starting":
            return message ?? "Happy Agent is starting automatically.";
        case "preparing":
        case "downloading":
            return "Happy is downloading and verifying Happy Agent for this machine.";
    }
}

/** A size as someone would say it, at the one decimal a release is worth. */
function byteSize(bytes: number): string {
    if (bytes < 1024) return `${String(bytes)} B`;
    if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pairingExpiration(expiresAt: number): string {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
        expiresAt,
    );
}

/**
 * Each assistant as its column says it: whose mark it carries, the product's
 * name, and the command that name is on this machine.
 *
 * The id is the command, which is why nothing here is looked up twice — but all
 * three are written out separately anyway. What a person is told to install and
 * what they are told to type are not always the same word, and the mark belongs
 * to the company rather than to the command: Codex is OpenAI's, so that is what
 * its mark is called here. Putting the wrong name on somebody else's trademark
 * is not a shortcut worth taking.
 */
const ASSISTANTS: Record<
    LocalOnboardingAssistantId,
    {
        command: string;
        mark: AssistantMarkName;
        name: string;
        /** Where the vendor tells you to get it, when the machine has not. */
        install: string;
        /** What signs you in, taken from each vendor's own documentation. */
        signIn: string;
        /** Only where the command alone does not finish the job. */
        signInNote?: string;
    }
> = {
    claude: {
        command: "claude",
        install: "https://code.claude.com/docs/en/setup",
        mark: "claude",
        name: "Claude Code",
        signIn: "claude auth login",
    },
    codex: {
        command: "codex",
        install: "https://developers.openai.com/codex/cli",
        mark: "openai",
        name: "Codex",
        signIn: "codex login",
    },
    grok: {
        command: "grok",
        install: "https://docs.x.ai/build/overview",
        mark: "grok",
        name: "Grok",
        // Grok has no login subcommand: running it is the sign-in.
        signIn: "grok",
        signInNote: "Sign in when the browser opens.",
    },
};

/** Where somebody stuck during first-run setup can go, and to whom. */
const HELP_LINKS = [
    { id: "discord", label: "Ask on Discord", url: "https://discord.gg/fX9WBAhyfD" },
    { id: "bra1n_dump", label: "DM @bra1n_dump on X", url: "https://x.com/bra1n_dump" },
    { id: "ex3ndr", label: "DM @Ex3NDR on X", url: "https://x.com/Ex3NDR" },
    {
        id: "issues",
        label: "Browse known issues",
        url: "https://github.com/slopus/happy/issues",
    },
] as const;

/**
 * One card on the report that follows an install: what is on the machine, and
 * where.
 *
 * A found assistant shows the path the shell gave, because the one question
 * somebody has about a machine that "has" a command is which one it found —
 * two versions on a PATH is the ordinary case, not the exotic one.
 */
function assistantAuthenticationEntry(assistant: LocalOnboardingAssistant): SetupAssistantEntry {
    const vendor = ASSISTANTS[assistant.id];
    const detail = (() => {
        switch (assistant.authentication) {
            case "checking":
                return "Checking…";
            case "valid":
                return "Signed in";
            case "invalid":
                return "Not signed in";
            case "error":
                return "Couldn't check";
            case "unavailable":
                return "Not installed";
        }
    })();
    // What to do about it: get the thing, or sign in to the thing that is
    // already here. A working assistant is asked for nothing.
    const action: SetupAssistantAction | undefined = (() => {
        switch (assistant.authentication) {
            case "unavailable":
                return {
                    href: vendor.install,
                    kind: "link",
                    label: `Install ${vendor.name}`,
                };
            case "invalid":
            case "error":
                return {
                    command: vendor.signIn,
                    kind: "command",
                    ...(vendor.signInNote ? { note: vendor.signInNote } : {}),
                };
            case "checking":
            case "valid":
                return undefined;
        }
    })();
    return {
        ...(action ? { action } : {}),
        detail,
        id: assistant.id,
        mark: vendor.mark,
        name: vendor.name,
        status:
            assistant.authentication === "valid"
                ? "found"
                : assistant.authentication === "checking"
                  ? "checking"
                  : "missing",
    };
}

/** The stable, dimmed three-vendor row shown before authentication resolves. */
const CHECKING_ASSISTANTS: readonly SetupAssistantEntry[] = Object.entries(ASSISTANTS).map(
    ([id, assistant]) => ({
        detail: "Checking…",
        id,
        mark: assistant.mark,
        name: assistant.name,
        status: "checking",
    }),
);

interface MachineSetupProjection {
    readonly assistants?: readonly SetupAssistantEntry[];
    readonly copy: string;
    readonly hasValidAuthentication: boolean;
    readonly label: string;
    readonly progress: SetupPageProgress;
    readonly ready: boolean;
    readonly refreshing: boolean;
    readonly title: string;
}

function machineSetupProject(view: LocalOnboardingView): MachineSetupProjection | undefined {
    if (view.kind === "agent-setup")
        return {
            copy: agentSetupCopy(view.phase, view.message),
            hasValidAuthentication: false,
            label: agentSetupProgressLabel(view.phase),
            progress: agentSetupProgress(view.phase),
            ready: false,
            refreshing: false,
            title: "Launching Happy Agent",
        };
    if (view.kind === "connecting")
        return {
            copy: "Happy Agent is starting and connecting to Happy.",
            hasValidAuthentication: false,
            label: "Waiting for Happy Agent…",
            progress: { kind: "waiting" },
            ready: false,
            refreshing: false,
            title: "Launching Happy Agent",
        };
    if (view.kind === "examining")
        return {
            assistants: CHECKING_ASSISTANTS,
            copy: "Happy is checking your Claude, Codex, and Grok sign-ins on this machine.",
            hasValidAuthentication: false,
            label: "Preparing authentication checks…",
            progress: { kind: "waiting" },
            ready: false,
            refreshing: true,
            title: "Checking your subscriptions",
        };
    if (view.kind === "provider-authentication") {
        const valid = view.assistants.some((assistant) => assistant.authentication === "valid");
        return {
            assistants: view.assistants.map(assistantAuthenticationEntry),
            copy: view.complete
                ? valid
                    ? "Happy will use these subscriptions for its work."
                    : "Happy works by running Claude Code, Codex, or Grok on your own subscription, so it needs at least one of them installed and signed in. Set one up below — this screen continues on its own."
                : "Happy is checking your Claude, Codex, and Grok sign-ins on this machine.",
            hasValidAuthentication: valid,
            label: "Checking subscription authentication…",
            progress: { fraction: 1, kind: "measured" },
            ready: view.complete,
            refreshing: !view.complete || view.refreshing === true,
            title: view.complete
                ? valid
                    ? "Subscriptions ready"
                    : "Happy needs a coding subscription"
                : "Checking your subscriptions",
        };
    }
    return undefined;
}

function MachineSetupStatus(props: {
    readonly projection: MachineSetupProjection;
    onContinue(): void;
    onRefresh?(): void;
}) {
    const showAssistants = props.projection.assistants !== undefined;
    return (
        <div
            className="happy-local-onboarding__machine-status"
            data-happy-desktop-ui="local-onboarding-machine-status"
            data-view={showAssistants ? "assistants" : "progress"}
        >
            <div
                aria-hidden={showAssistants}
                className="happy-local-onboarding__machine-progress"
                data-happy-desktop-ui="local-onboarding-machine-progress"
            >
                <SetupProgress
                    label={props.projection.label}
                    progress={props.projection.progress}
                />
            </div>
            <div
                aria-hidden={!showAssistants}
                className="happy-local-onboarding__machine-assistants"
                data-happy-desktop-ui="local-onboarding-machine-assistants"
            >
                <SetupAssistants
                    assistants={props.projection.assistants ?? CHECKING_ASSISTANTS}
                    data-testid={showAssistants ? "local-onboarding-assistants" : undefined}
                    refreshing={props.projection.refreshing}
                    title="Subscriptions"
                    {...(props.onRefresh ? { onRefresh: props.onRefresh } : {})}
                />
                <div
                    aria-hidden={!props.projection.hasValidAuthentication}
                    className="happy-local-onboarding__machine-actions"
                >
                    {/* Nothing signed in is not a step to skip past: without a
                        subscription there is no product to go on to. */}
                    {props.projection.ready && props.projection.hasValidAuthentication ? (
                        <Button onClick={props.onContinue} size="large" width={240}>
                            Continue
                        </Button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

/**
 * First-run setup for this machine, as one machine-setup surface followed by
 * the profile, optional mobile connection, and project decisions it discovers
 * are still owed.
 *
 * Every state is one `SetupPage`: a picture of what is happening, a sentence
 * naming it, a line explaining it, and at most one thing to do. Download,
 * launch, subscription discovery, and automatic verification retain one transition
 * identity so their live progress changes in place instead of becoming a tour
 * of setup pages.
 *
 * Which stage is showing is entirely the caller's, derived from what is true of
 * the machine rather than from a position someone remembered, so an interrupted
 * install or a restart resumes at the truthful stage. This component only draws
 * it.
 */
export function LocalOnboardingScreen(props: LocalOnboardingScreenProps) {
    const { view } = props;
    if (view.kind === "happy-mobile-desktop")
        return (
            <DesktopMobileSetup
                appearance={props.appearance}
                help={<OnboardingHelp onExternalOpen={props.onExternalOpen} />}
                step={view.step}
                onboarding={props.showSteps}
                {...(props.onStageSelect ? { onStageSelect: props.onStageSelect } : {})}
                onContinue={props.onHappyMobileConnect}
                onSkip={props.onHappyMobileSkip}
                onPlatformSelect={props.onHappyMobilePlatformSelect}
            />
        );
    // Download, start, discovery, and verification are one machine-setup
    // surface. Profile, mobile pairing, and project decisions begin their own
    // pages after that machine work.
    const transitionKey = (() => {
        switch (view.kind) {
            case "profile-required":
            case "project":
            case "finishing":
            case "happy-mobile-checking":
            case "happy-mobile-offer":
            case "happy-mobile-pairing":
            case "happy-mobile-failed":
                return view.kind;
            default:
                return "local-agent-setup";
        }
    })();
    const frame = {
        backdrop: { appearance: props.appearance, kind: "sky" },
        transitionKey,
        help: <OnboardingHelp onExternalOpen={props.onExternalOpen} />,
        steps: props.showSteps ? (
            <OnboardingSteps
                scope="desktop"
                stage={onboardingStage(view)}
                {...(props.reachedStage ? { reached: props.reachedStage } : {})}
                {...(props.onStageSelect ? { onStageSelect: props.onStageSelect } : {})}
                failed={
                    view.kind === "node-missing" ||
                    view.kind === "connect-failed" ||
                    view.kind === "happy-mobile-failed"
                }
            />
        ) : undefined,
    } as const;
    const machineSetup = machineSetupProject(view);

    if (machineSetup)
        return (
            <SetupPage
                {...frame}
                className="happy-local-onboarding__machine-setup"
                copy={machineSetup.copy}
                data-testid="local-onboarding-screen"
                scene="owl"
                title={machineSetup.title}
            >
                <MachineSetupStatus
                    onContinue={props.onAssistantsContinue}
                    projection={machineSetup}
                    {...(props.onSubscriptionsRefresh
                        ? { onRefresh: props.onSubscriptionsRefresh }
                        : {})}
                />
            </SetupPage>
        );

    if (view.kind === "agent-ready")
        return (
            <SetupPage
                {...frame}
                action={{ label: "Continue", onSelect: props.onAssistantsContinue, width: 240 }}
                copy="Happy Agent runs your agents on this machine. It's installed and connected — nothing to do here."
                data-testid="local-onboarding-screen"
                scene="owl"
                title="Happy Agent is running"
                auxiliary={
                    <div className="happy-local-onboarding__facts">
                        {view.version ? <span>Happy Agent {view.version}</span> : null}
                        {view.nodeVersion ? <span>Node {view.nodeVersion}</span> : null}
                    </div>
                }
            />
        );

    if (view.kind === "checking")
        return (
            <SetupPage
                {...frame}
                copy={view.message ?? "Reading what this machine already has."}
                data-testid="local-onboarding-screen"
                scene="snail"
                title="Checking this machine…"
            />
        );

    if (view.kind === "node-missing")
        return (
            <SetupPage
                {...frame}
                copy="Happy Agent runs on Node, and Happy will not put a runtime on your machine by itself. Install Node and setup continues on its own."
                data-testid="local-onboarding-screen"
                scene="wand"
                title="Node.js is required"
            />
        );

    if (view.kind === "happy-mobile-checking")
        return (
            <SetupPage
                {...frame}
                copy="Reading this Happy Agent's mobile connection."
                data-testid="local-onboarding-screen"
                scene="snail"
                title="Checking Happy Mobile…"
            />
        );

    if (view.kind === "happy-mobile-offer")
        return (
            <SetupPage
                {...frame}
                className="happy-local-onboarding__mobile"
                copy={
                    view.message ??
                    "Connect Happy, Claude Code, and Codex to Happy Mobile. Follow sessions, reply, and approve requests when you're away from your desk."
                }
                data-testid="local-onboarding-screen"
                scene="alien-monster"
                title="Take Happy with you"
                auxiliary={
                    <Button onClick={props.onHappyMobileSkip} size="medium" variant="ghost">
                        Skip mobile setup
                    </Button>
                }
            >
                <div className="happy-local-onboarding__mobile-actions">
                    <Button
                        loading={view.busy}
                        onClick={props.onHappyMobileConnect}
                        size="large"
                        width={240}
                    >
                        Connect Happy Mobile
                    </Button>
                </div>
            </SetupPage>
        );

    if (view.kind === "happy-mobile-pairing")
        return (
            <SetupPage
                {...frame}
                className="happy-local-onboarding__mobile happy-local-onboarding__mobile-pairing"
                copy="Open Happy Mobile, choose Pair Desktop, then scan this code. Happy continues automatically when your phone approves."
                data-testid="local-onboarding-screen"
                title="Scan with Happy Mobile"
                auxiliary={
                    <Button onClick={props.onHappyMobileSkip} size="medium" variant="ghost">
                        Skip mobile setup
                    </Button>
                }
            >
                <div className="happy-local-onboarding__mobile-pairing-body">
                    <QRCode
                        data={view.data}
                        data-testid="happy-mobile-pairing-qr"
                        label="QR code to pair Happy Mobile"
                        size={240}
                    />
                    <PairingLinkCopy data={view.data} />
                    <div className="happy-local-onboarding__mobile-waiting">
                        <Spinner label="Pairing in progress" size={16} tone="inverse" />
                        <span>
                            Waiting for your phone · expires {pairingExpiration(view.expiresAt)}
                        </span>
                    </div>
                </div>
            </SetupPage>
        );

    if (view.kind === "happy-mobile-failed")
        return (
            <SetupPage
                {...frame}
                className="happy-local-onboarding__mobile"
                copy={view.message}
                data-testid="local-onboarding-screen"
                scene="owl"
                title="Happy Mobile didn't connect"
                auxiliary={
                    <Button onClick={props.onHappyMobileSkip} size="medium" variant="ghost">
                        Skip mobile setup
                    </Button>
                }
            >
                <div className="happy-local-onboarding__mobile-actions">
                    <Button
                        loading={view.busy}
                        onClick={props.onHappyMobileConnect}
                        size="large"
                        width={240}
                    >
                        Try again
                    </Button>
                </div>
            </SetupPage>
        );

    if (view.kind === "profile-required")
        return (
            <SetupPage
                {...frame}
                action={{
                    busy: view.busy,
                    disabled: !view.name.trim() || !view.email.trim(),
                    label: "Create profile",
                    onSelect: props.onProfileCreate,
                    width: 240,
                }}
                copy={
                    view.message ??
                    "Happy Agent uses this identity for your work and for messages shared with other Happy Agents."
                }
                data-testid="local-onboarding-screen"
                scene="disguised-face"
                title="Create your profile"
            >
                <div className="happy-local-onboarding__profile-form">
                    <TextField
                        autoFocus
                        fullWidth
                        label="Name"
                        onSubmit={props.onProfileCreate}
                        onValueChange={props.onProfileNameChange}
                        placeholder="Your name"
                        required
                        value={view.name}
                    />
                    <TextField
                        fullWidth
                        label="Git email"
                        onSubmit={props.onProfileCreate}
                        onValueChange={props.onProfileEmailChange}
                        placeholder="you@example.com"
                        required
                        type="email"
                        value={view.email}
                    />
                </div>
            </SetupPage>
        );

    if (view.kind === "connect-failed")
        return (
            <SetupPage
                {...frame}
                action={{
                    busy: view.retrying,
                    label: "Try again",
                    onSelect: props.onConnectRetry,
                }}
                command={DAEMON_START_COMMAND}
                // Whatever actually refused, verbatim. This screen used to say
                // nothing at all above a bare retry, which left a daemon failing
                // for a nameable reason looking like a button that did nothing.
                copy={view.message}
                data-testid="local-onboarding-screen"
                scene="owl"
                title="Happy could not reach Happy Agent"
            />
        );

    if (view.kind === "project")
        return (
            <SetupPage
                {...frame}
                action={{
                    disabled: view.busy,
                    label: view.busy ? "Opening…" : "Choose a folder…",
                    onSelect: props.onProjectChoose,
                    width: 240,
                }}
                copy={
                    view.message ??
                    "Point Happy at a folder you work in. It becomes your first project, and you can add more later."
                }
                data-testid="local-onboarding-screen"
                scene="wand"
                title="Open your first project"
                auxiliary={
                    props.onProjectSetupBack ? (
                        <Button
                            disabled={view.busy}
                            onClick={props.onProjectSetupBack}
                            variant="ghost"
                        >
                            Back to setup options
                        </Button>
                    ) : null
                }
            />
        );

    return null;
}

function onboardingStage(view: LocalOnboardingView): OnboardingStage {
    switch (view.kind) {
        case "examining":
        case "provider-authentication":
            return "subscriptions";
        case "profile-required":
            return "profile";
        case "happy-mobile-desktop":
            return view.step.kind === "link" && view.step.appReady
                ? "connect-phone"
                : view.step.kind === "connected"
                  ? "connect-phone"
                  : "get-app";
        case "happy-mobile-checking":
        case "happy-mobile-offer":
            return "get-app";
        case "happy-mobile-pairing":
        case "happy-mobile-failed":
        case "finishing":
        case "project":
            return "connect-phone";
        default:
            return "setup";
    }
}

/**
 * The pairing payload, offered as a link for a phone that cannot see the
 * screen. The daemon's contract says this string is either encoded as a QR
 * code or handed over as a copyable deep link, and that it is opaque — so it
 * is copied exactly as it arrived and nothing here reads it.
 */
function PairingLinkCopy(props: { readonly data: string }) {
    return (
        <CopyButton
            caption="Copy auth link"
            className="happy-local-onboarding__pairing-link"
            copiedCaption="Link copied"
            data-testid="happy-mobile-pairing-copy"
            label="Copy auth link"
            text={props.data}
        />
    );
}

/** Somewhere to turn on every screen, without leaving the step you are on. */
function OnboardingHelp(props: { onExternalOpen?(url: string): void }) {
    return (
        <MenuButton
            align="end"
            icon="users"
            items={HELP_LINKS.map((link) => ({ id: link.id, kind: "item", label: link.label }))}
            label="Get help"
            menuLabel="Get help"
            onSelect={(id) => {
                const link = HELP_LINKS.find((candidate) => candidate.id === id);
                if (link) props.onExternalOpen?.(link.url);
            }}
            size="medium"
            text="Get help"
            variant="ghost"
        />
    );
}
