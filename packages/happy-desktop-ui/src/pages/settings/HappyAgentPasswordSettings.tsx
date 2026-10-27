import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { FormRow } from "../../FormRow";
import { TextField } from "../../TextField";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentPasswordSettingsProps {
    /** Whether this host reads saved logins at all. */
    readonly available: boolean;
    readonly loading?: boolean;
    readonly pending?: boolean;
    readonly error?: string;
    readonly onePasswordInstalled: boolean;
    /** The connected account, or null when 1Password is not connected. */
    readonly onePasswordAccount: string | null;
    readonly onePasswordAccountDraft: string;
    onOnePasswordAccountDraftChange(value: string): void;
    onOnePasswordConnect(): void;
    onOnePasswordDisconnect(): void;
}

/**
 * Saved logins come from the browsers and password manager the person already
 * uses, read when they open the picker. This page says so, and connects 1Password.
 */
export function HappyAgentPasswordSettings(props: HappyAgentPasswordSettingsProps) {
    return (
        <HappyAgentSettingsSection
            description="Happy fills logins from your browsers and 1Password on demand. It never stores passwords, imports them in bulk, or copies sessions."
            title="Saved logins"
        >
            {props.available ? (
                <>
                    {props.error ? (
                        <Banner tone="danger" title="1Password did not connect">
                            {props.error}
                        </Banner>
                    ) : null}
                    {props.onePasswordAccount !== null ? (
                        <FormRow
                            control={
                                <Button
                                    disabled={props.pending}
                                    loading={props.pending}
                                    onClick={props.onOnePasswordDisconnect}
                                    size="small"
                                    variant="secondary"
                                >
                                    Disconnect
                                </Button>
                            }
                            description={`Connected as ${props.onePasswordAccount}`}
                            label="1Password"
                        />
                    ) : props.onePasswordInstalled ? (
                        <FormRow
                            control={
                                <Box className="happy-agent-passwords__connect">
                                    <TextField
                                        aria-label="1Password account name"
                                        disabled={props.pending || props.loading}
                                        id="happy-agent-settings-one-password-account"
                                        onSubmit={props.onOnePasswordConnect}
                                        onValueChange={props.onOnePasswordAccountDraftChange}
                                        placeholder="Account name"
                                        size="small"
                                        value={props.onePasswordAccountDraft}
                                    />
                                    <Button
                                        disabled={
                                            props.loading ||
                                            props.pending ||
                                            props.onePasswordAccountDraft.trim() === ""
                                        }
                                        loading={props.pending}
                                        onClick={props.onOnePasswordConnect}
                                        size="small"
                                        variant="secondary"
                                    >
                                        Connect
                                    </Button>
                                </Box>
                            }
                            description="Your account name, as shown at the top of 1Password's sidebar."
                            htmlFor="happy-agent-settings-one-password-account"
                            label="1Password"
                            layout="stacked"
                        />
                    ) : (
                        <FormRow
                            control={null}
                            description="Install the 1Password app to use its logins here."
                            label="1Password"
                        />
                    )}
                </>
            ) : (
                <Banner tone="neutral" title="Available in Happy for macOS and Windows">
                    Saved logins are read from your browsers on this computer.
                </Banner>
            )}
        </HappyAgentSettingsSection>
    );
}
