import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { DataDisclosure, type DataDisclosureGroup } from "../../DataDisclosure";
import { FormRow } from "../../FormRow";
import { TextField } from "../../TextField";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** What the saved-login picker does and, above all, what Happy never does with a password. */
const PASSWORD_DISCLOSURE: readonly DataDisclosureGroup[] = [
    {
        kind: "shared",
        title: "What Happy does",
        items: [
            "Reads the logins saved for the site you are on, only when you open the picker",
            "Decrypts only the login you pick, and fills it into that page",
            "Offers to save a new password to 1Password, when you connected it",
        ],
    },
    {
        kind: "withheld",
        title: "What Happy never does",
        items: [
            "Store a password: there is no Happy vault",
            "Import your passwords in bulk",
            "Copy sessions or cookies from your browsers",
            "Give a password to an agent",
        ],
    },
];

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
        <>
            <HappyAgentSettingsSection
                description="Click a sign-in field, or the key in the browser's toolbar, to pick a login saved in your browsers or 1Password."
                title="Saved logins"
            >
                {props.available ? null : (
                    <Banner tone="neutral" title="Available in Happy for macOS and Windows">
                        Saved logins are read from your browsers on this computer.
                    </Banner>
                )}
                <DataDisclosure
                    data-testid="happy-agent-settings-password-disclosure"
                    groups={PASSWORD_DISCLOSURE}
                />
            </HappyAgentSettingsSection>
            {props.available ? (
                <HappyAgentSettingsSection title="1Password">
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
                            description={props.onePasswordAccount}
                            label="Connected"
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
                            description="The name at the top of 1Password's sidebar. First turn on Settings › Developer › Integrate with other apps in 1Password."
                            htmlFor="happy-agent-settings-one-password-account"
                            label="Account"
                            layout="stacked"
                        />
                    ) : (
                        <FormRow
                            control={null}
                            description="Install the 1Password app to pick its logins here and save new passwords to it."
                            label="Not installed"
                        />
                    )}
                </HappyAgentSettingsSection>
            ) : null}
        </>
    );
}
