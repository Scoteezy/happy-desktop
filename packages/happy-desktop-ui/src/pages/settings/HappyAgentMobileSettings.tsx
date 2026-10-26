import type { ReactNode } from "react";
import type { BadgeVariant } from "../../Badge";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { Box } from "../../Box";
import { FormRow } from "../../FormRow";
import {
    MobileAccessConfirmation,
    MobileAccessDetail,
    type MobileAccessConfirmationState,
} from "../../MobileAccessConfirmation";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";
import { HappyAgentSettingsStatus } from "./HappyAgentSettingsStatus";

export type HappyAgentMobileStatus =
    | "loading"
    | "disabled"
    | "disconnected"
    | "pairing"
    | "connecting"
    | "connected"
    | "failed"
    | "unavailable";

/** The machine's global Happy CLI, read on its own; nothing here is matched to the Agent. */
export type HappyAgentMobileTerminal =
    | { readonly status: "loading" }
    | { readonly status: "not-installed" }
    | { readonly status: "unavailable"; readonly message: string; readonly cliVersion?: string }
    | {
          readonly status: "available";
          readonly cliVersion: string;
          readonly auth: "missing" | "v2" | "legacy" | "invalid";
          readonly accountKeyFingerprint?: string;
          readonly serverUrl: string;
          readonly machineId?: string;
          readonly daemon: {
              readonly state:
                  | "stopped"
                  | "online"
                  | "offline"
                  | "unavailable"
                  | "identity-mismatch"
                  | "version-mismatch";
          };
      };

export interface HappyAgentMobileSettingsProps {
    /** Undefined until Happy Agent has reported its durable configuration. */
    readonly configured?: boolean;
    readonly status: HappyAgentMobileStatus;
    /** When the integration last changed, as the Agent reports it (epoch ms). */
    readonly updatedAt?: number;
    readonly disconnecting?: boolean;
    /** True while Happy Agent is asked to connect a saved pairing again. */
    readonly pairingStarting?: boolean;
    /** Why the live integration state could not be read. */
    readonly error?: string;
    /** Why the last disconnect attempt was refused. */
    readonly disconnectError?: string;
    /** Detail Happy Agent reported for a failed or disconnected integration. */
    readonly message?: string;
    /**
     * Whether Disconnect deletes this computer, and the chats it published,
     * from the Happy account. Older Happy Agents only forget their pairing.
     */
    readonly removesComputer?: boolean;
    /**
     * This window asked to remove the computer and Happy could not confirm it.
     * The pairing stays saved and closed until the removal is retried or
     * abandoned; `message` carries the Agent's reason.
     */
    readonly removalIncomplete?: boolean;
    /** Why actions cannot currently reach this Happy Agent. */
    readonly unavailable?: string;
    /** The local terminal CLI; absent for a remote Agent, which has no local CLI. */
    readonly terminal?: HappyAgentMobileTerminal;
    readonly terminalSetupSupport?: "standalone" | "personal" | "unknown";
    readonly terminalReadError?: string;
    /** The open destructive confirmation, if any. */
    readonly management?: MobileAccessConfirmationState;
    /** Opens the terminal sign-out confirmation; absent when the host cannot reset. */
    readonly onTerminalReset?: () => void;
    /** Opens the disconnect confirmation. */
    onDisconnect(): void;
    /** Retries a refused removal without asking again; the person already confirmed. */
    onRemovalRetry?(): void;
    /** Keeps a saved pairing and connects it again. */
    onReconnect?(): void;
    onManagementCancel?(): void;
    onManagementConfirm?(): void;
    onTerminalRegistrationRemovalChange?(remove: boolean): void;
    /** Opens pairing with both methods side by side, whatever the relay's state. */
    onPairingOptionsOpen(): void;
    /** The open pairing UI (MobilePairingOptions), shown in place of Connect a phone. */
    readonly pairingOptions?: ReactNode;
    /** The direct connection's section body (MobileDirectConnectionSection). */
    readonly direct: ReactNode;
}

interface MobileState {
    readonly label: string;
    readonly variant: BadgeVariant;
    readonly description: string;
}

/**
 * The Mobile Access category: connecting a phone, then only what is linked — the
 * relay when it is, each directly paired phone — and any error; the terminal
 * CLI; and removal.
 */
export function HappyAgentMobileSettings(props: HappyAgentMobileSettingsProps) {
    const mobile = mobileState(props);
    const blocked = props.unavailable !== undefined;
    const paired = props.configured === true;
    return (
        <>
            <HappyAgentSettingsSection>
                {props.unavailable && props.pairingOptions === undefined ? (
                    <Banner tone="warning" title="Happy Agent unavailable">
                        {props.unavailable}
                    </Banner>
                ) : null}
                {props.pairingOptions ?? (
                    <FormRow
                        align="start"
                        control={
                            <Button
                                disabled={blocked}
                                icon="link"
                                onClick={props.onPairingOptionsOpen}
                                size="small"
                                variant="primary"
                            >
                                Connect phone
                            </Button>
                        }
                        description="Shows the relay and direct codes side by side"
                        label="Connect a phone"
                    />
                )}
                {props.error ? (
                    <Banner tone="danger" title="Happy Mobile status unavailable">
                        {props.error}
                    </Banner>
                ) : null}
                {props.removalIncomplete ? (
                    <Box
                        className="happy-agent-mobile-settings__removal"
                        data-testid="happy-mobile-settings-removal-incomplete"
                    >
                        <Banner tone="danger" title="Couldn't remove this computer from your phone">
                            {props.message ?? props.disconnectError}
                        </Banner>
                        <Box className="happy-agent-mobile-settings__removal-actions">
                            <Button
                                disabled={blocked || props.pairingStarting === true}
                                onClick={() => props.onReconnect?.()}
                                size="small"
                                variant="ghost"
                            >
                                Keep linked
                            </Button>
                            <Button
                                disabled={blocked || props.pairingStarting === true}
                                loading={props.disconnecting}
                                onClick={() => props.onRemovalRetry?.()}
                                size="small"
                                variant="primary"
                            >
                                Try again
                            </Button>
                        </Box>
                    </Box>
                ) : props.disconnectError ? (
                    <Banner tone="danger" title="Pairing could not be removed">
                        {props.disconnectError}
                    </Banner>
                ) : null}
                {relayShown(props) ? (
                    <FormRow
                        control={
                            <HappyAgentSettingsStatus
                                label={mobile.label}
                                variant={mobile.variant}
                            />
                        }
                        description={
                            props.status === "connected"
                                ? "Phones on your Happy account reach this computer from anywhere"
                                : statusDetail(mobile.description, props)
                        }
                        label="Happy relay"
                    />
                ) : null}
                {props.direct}
            </HappyAgentSettingsSection>
            {props.terminal ? (
                <TerminalSection
                    blocked={blocked || props.disconnecting === true}
                    paired={paired}
                    terminal={props.terminal}
                    setupSupport={props.terminalSetupSupport}
                    readError={props.terminalReadError}
                    onTerminalReset={props.onTerminalReset}
                />
            ) : null}
            {paired ? (
                <HappyAgentSettingsSection>
                    <FormRow
                        align="start"
                        control={
                            <Button
                                disabled={blocked}
                                icon="unlink"
                                loading={props.disconnecting}
                                onClick={props.onDisconnect}
                                size="small"
                                variant="danger"
                            >
                                Disconnect
                            </Button>
                        }
                        description={
                            props.removesComputer
                                ? "Remove this computer and the chats it published from your Happy account. Local history stays."
                                : "Forget this computer's pairing. Your account, phones and history stay."
                        }
                        label="Disconnect this computer"
                    />
                </HappyAgentSettingsSection>
            ) : null}
            {props.management ? (
                <MobileAccessConfirmation
                    confirmation={props.management}
                    data-testid="happy-mobile-settings-confirmation"
                    removesComputer={props.removesComputer === true}
                    onCancel={() => props.onManagementCancel?.()}
                    onConfirm={() => props.onManagementConfirm?.()}
                    onRegistrationRemovalChange={props.onTerminalRegistrationRemovalChange}
                />
            ) : null}
        </>
    );
}

function TerminalSection(props: {
    readonly blocked: boolean;
    readonly paired: boolean;
    readonly terminal: HappyAgentMobileTerminal;
    readonly onTerminalReset?: () => void;
    readonly setupSupport?: "standalone" | "personal" | "unknown";
    readonly readError?: string;
}) {
    const { terminal } = props;
    const ready =
        terminal.status === "available" &&
        (terminal.auth === "v2" || terminal.auth === "legacy") &&
        terminal.daemon.state === "online";
    return (
        <HappyAgentSettingsSection
            description="Terminal Claude Code and Codex sessions you can follow from your phone."
            title="Terminal (Happy CLI)"
        >
            {props.readError ? (
                <Banner tone="warning" title="Terminal status could not be checked">
                    {props.readError}
                </Banner>
            ) : null}
            {props.paired && props.setupSupport === "personal" ? (
                <FormRow
                    label="Personal pairing"
                    control={
                        <HappyAgentSettingsStatus label="Separate sign-in" variant="neutral" />
                    }
                    description="Happy Mobile is paired to your personal Agent account. The existing CLI sign-in below is separate and has not been matched to this pairing."
                />
            ) : props.paired && props.setupSupport === "unknown" ? (
                <FormRow
                    label="Pairing scope"
                    control={<HappyAgentSettingsStatus label="Unavailable" variant="neutral" />}
                    description="The Agent pairing scope could not be identified. Terminal CLI status below is read independently; your saved phone pairing remains usable."
                />
            ) : null}
            {terminal.status === "loading" ? (
                <FormRow
                    control={<HappyAgentSettingsStatus label="Checking…" variant="neutral" />}
                    description="Reading the Happy CLI installed on this computer."
                    label="Happy CLI"
                />
            ) : terminal.status === "not-installed" ? (
                <FormRow
                    control={<HappyAgentSettingsStatus label="Not installed" variant="neutral" />}
                    description="No Happy CLI is installed globally on this computer."
                    label="Happy CLI"
                />
            ) : terminal.status === "unavailable" ? (
                <FormRow
                    control={<HappyAgentSettingsStatus label="Unavailable" variant="warning" />}
                    description={
                        terminal.cliVersion
                            ? `Version ${terminal.cliVersion}. ${terminal.message}`
                            : terminal.message
                    }
                    label="Happy CLI"
                />
            ) : (
                <>
                    <FormRow
                        control={
                            ready ? (
                                <HappyAgentSettingsStatus label="Ready" variant="success" />
                            ) : (
                                <HappyAgentSettingsStatus label="Not ready" variant="warning" />
                            )
                        }
                        description={`Version ${terminal.cliVersion}`}
                        label="Happy CLI"
                    />
                    <FormRow
                        align="start"
                        control={<AuthBadge auth={terminal.auth} />}
                        description={authDescription(terminal.auth)}
                        label="Sign-in"
                    />
                    <Box className="happy-agent-mobile-settings__details">
                        <MobileAccessDetail label="Server" value={terminal.serverUrl} />
                        {terminal.accountKeyFingerprint ? (
                            <MobileAccessDetail
                                fingerprint
                                label="Account key"
                                value={terminal.accountKeyFingerprint}
                            />
                        ) : null}
                        {terminal.machineId ? (
                            <MobileAccessDetail label="Machine ID" value={terminal.machineId} />
                        ) : null}
                    </Box>
                    <FormRow
                        align="start"
                        control={
                            <HappyAgentSettingsStatus
                                label={DAEMON_LABELS[terminal.daemon.state]}
                                variant={DAEMON_VARIANTS[terminal.daemon.state]}
                            />
                        }
                        description={daemonDescription(terminal.daemon.state)}
                        label="Daemon"
                    />
                </>
            )}
            {terminal.status === "available" &&
            (terminal.auth !== "missing" || terminal.machineId !== undefined) &&
            props.onTerminalReset ? (
                <FormRow
                    align="start"
                    control={
                        <Button
                            disabled={props.blocked}
                            onClick={props.onTerminalReset}
                            size="small"
                            variant="danger"
                        >
                            Remove saved login
                        </Button>
                    }
                    description="Delete the Happy CLI's saved sign-in and stop its daemon. Running terminal sessions are kept and can stay connected until they end. You'll review the exact scope first."
                    label="Remove saved terminal login"
                />
            ) : null}
        </HappyAgentSettingsSection>
    );
}

function AuthBadge(props: { readonly auth: "missing" | "v2" | "legacy" | "invalid" }) {
    switch (props.auth) {
        case "missing":
            return <HappyAgentSettingsStatus label="Not signed in" variant="neutral" />;
        case "v2":
            return <HappyAgentSettingsStatus label="Signed in" variant="success" />;
        case "legacy":
            return <HappyAgentSettingsStatus label="Older sign-in" variant="warning" />;
        case "invalid":
            return <HappyAgentSettingsStatus label="Unreadable" variant="danger" />;
    }
}

function authDescription(auth: "missing" | "v2" | "legacy" | "invalid"): string {
    switch (auth) {
        case "missing":
            return "The Happy CLI has no saved sign-in on this computer.";
        case "v2":
            return "The Happy CLI has a saved sign-in. Whether it is the same account as this Happy Agent is not checked here.";
        case "legacy":
            return "The Happy CLI is signed in using the legacy credential format. Terminal sessions are available when its daemon is online.";
        case "invalid":
            return "The Happy CLI's saved sign-in could not be read.";
    }
}

type DaemonState = Extract<HappyAgentMobileTerminal, { status: "available" }>["daemon"]["state"];

const DAEMON_LABELS: Record<DaemonState, string> = {
    stopped: "Stopped",
    online: "Online",
    offline: "Offline",
    unavailable: "Unknown",
    "identity-mismatch": "Different identity",
    "version-mismatch": "Different version",
};

const DAEMON_VARIANTS: Record<DaemonState, BadgeVariant> = {
    stopped: "neutral",
    online: "success",
    offline: "warning",
    unavailable: "neutral",
    "identity-mismatch": "danger",
    "version-mismatch": "warning",
};

function daemonDescription(state: DaemonState): string {
    switch (state) {
        case "stopped":
            return "The Happy CLI daemon is not running.";
        case "online":
            return "The Happy CLI daemon is running and connected to its server.";
        case "offline":
            return "The Happy CLI daemon is running but not connected to its server.";
        case "unavailable":
            return "The Happy CLI daemon's status could not be read.";
        case "identity-mismatch":
            return "The running daemon reports a different machine or server than the CLI's saved sign-in.";
        case "version-mismatch":
            return "The running daemon is a different version from the installed Happy CLI.";
    }
}

function mobileState(props: HappyAgentMobileSettingsProps): MobileState {
    switch (props.status) {
        case "loading":
            return {
                label: "Checking…",
                variant: "neutral",
                description: "Reading the Happy Mobile connection from Happy Agent.",
            };
        case "unavailable":
            return {
                label: "Unavailable",
                variant: "neutral",
                description: "This Happy Agent does not report Happy Mobile integration state.",
            };
        case "disabled":
            return {
                label: "Disabled",
                variant: "neutral",
                description:
                    "Happy Mobile integration is disabled in this Happy Agent installation.",
            };
        case "pairing":
            return {
                label: "Waiting for phone",
                variant: "info",
                description: "Waiting for a phone to scan the code.",
            };
        case "connected":
            return {
                label: "Connected",
                variant: "success",
                description: "Live with Happy Mobile.",
            };
        case "connecting":
            return {
                label: "Reconnecting",
                variant: "info",
                description: "Connecting the saved pairing.",
            };
        case "disconnected":
            return props.configured === true
                ? {
                      label: "Offline — pairing saved",
                      variant: "warning",
                      description: "Paired, but not connected right now.",
                  }
                : props.configured === false
                  ? {
                        label: "Not set up",
                        variant: "neutral",
                        description: "No phone is paired yet.",
                    }
                  : {
                        label: "Checking…",
                        variant: "neutral",
                        description: "Reading whether this Happy Agent has a saved pairing.",
                    };
        case "failed":
            if (props.configured === true && props.removalIncomplete)
                return {
                    label: "Removal incomplete",
                    variant: "warning",
                    description:
                        "This computer is still linked but not connected while the removal is unfinished.",
                };
            return props.configured === true
                ? {
                      label: "Can't connect",
                      variant: "danger",
                      description:
                          "The pairing is saved, but Happy Agent could not connect to Happy Mobile.",
                  }
                : {
                      label: "Not set up",
                      variant: "neutral",
                      description: "The last pairing attempt did not finish.",
                  };
    }
}

/**
 * Whether the relay has anything to say: it is linked, or it is in a state worth
 * knowing about. An unlinked relay that is merely idle is left out.
 */
function relayShown(props: HappyAgentMobileSettingsProps): boolean {
    if (props.configured === true) return true;
    return props.status !== "loading" && props.status !== "disconnected";
}

/** The state line, the Agent's own detail, and when the Agent last saw it change. */
function statusDetail(description: string, props: HappyAgentMobileSettingsProps): string {
    const parts = [description];
    // The removal banner already says it; the status line does not repeat it.
    if (
        props.message &&
        !props.removalIncomplete &&
        (props.status === "failed" || props.status === "disconnected")
    )
        parts.push(props.message);
    if (props.updatedAt !== undefined)
        parts.push(
            `Last changed ${new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
            }).format(props.updatedAt)}.`,
        );
    return parts.join(" ");
}
