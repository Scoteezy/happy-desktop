import { useId } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { FormRow } from "../../FormRow";
import { Spinner } from "../../Spinner";
import { Switch } from "../../Switch";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentStoriesSettingsProps {
    readonly connectionLabel: string;
    readonly status: "loading" | "ready" | "unsupported";
    readonly enabled: boolean;
    readonly saving?: boolean;
    readonly unavailable?: string;
    readonly error?: string;
    readonly saveError?: string;
    onEnabledChange(enabled: boolean): void;
}

/**
 * A person's opt-in to Stories on one connection: the stories row above the
 * sidebar, the story viewer, and "post it" in conversations.
 */
export function HappyAgentStoriesSettings(props: HappyAgentStoriesSettingsProps) {
    const id = useId();
    return (
        <HappyAgentSettingsSection title={props.connectionLabel}>
            {props.unavailable ? (
                <Banner tone="neutral" title="Connection unavailable">
                    {props.unavailable}
                </Banner>
            ) : null}
            {props.error ? (
                <Banner tone="danger" title="Stories settings unavailable">
                    {props.error}
                </Banner>
            ) : null}
            {props.saveError ? (
                <Banner tone="danger" title="Stories preference not saved">
                    {props.saveError}
                </Banner>
            ) : null}
            {props.status === "unsupported" ? (
                <Banner tone="neutral" title="Stories settings unavailable">
                    This connection does not provide user settings.
                </Banner>
            ) : null}
            <FormRow
                label="Stories"
                description="Your team’s stories above the sidebar; any agent drafts one for you when you say “post it”"
                htmlFor={id}
                control={
                    <Box className="happy-agent-settings__pending">
                        {props.status === "loading" || props.saving ? (
                            <>
                                <Spinner size={16} />
                                <span role="status">
                                    {props.status === "loading" ? "Reading preference…" : "Saving…"}
                                </span>
                            </>
                        ) : null}
                        <Switch
                            aria-label={`Stories — ${props.connectionLabel}`}
                            checked={props.enabled}
                            disabled={
                                props.status !== "ready" ||
                                props.saving === true ||
                                props.unavailable !== undefined ||
                                props.error !== undefined
                            }
                            id={id}
                            onChange={props.onEnabledChange}
                            size="small"
                        />
                    </Box>
                }
            />
        </HappyAgentSettingsSection>
    );
}
