import { useId } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { FormRow } from "../../FormRow";
import { Spinner } from "../../Spinner";
import { Switch } from "../../Switch";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentTaskSettingsProps {
    readonly connectionLabel: string;
    readonly status: "loading" | "ready" | "unsupported";
    readonly autoJoinEnabled?: boolean;
    readonly saving?: boolean;
    readonly unavailable?: string;
    readonly error?: string;
    readonly saveError?: string;
    onAutoJoinChange(enabled: boolean): void;
}

/** One connection's per-user preference; the server owns all membership changes. */
export function HappyAgentTaskSettings(props: HappyAgentTaskSettingsProps) {
    const id = useId();
    return (
        <HappyAgentSettingsSection
            description="Your task preference on this connection follows you across devices."
            title={props.connectionLabel}
        >
            {props.unavailable ? (
                <Banner tone="neutral" title="Connection unavailable">
                    {props.unavailable}
                </Banner>
            ) : null}
            {props.error ? (
                <Banner tone="danger" title="Task settings unavailable">
                    {props.error}
                </Banner>
            ) : null}
            {props.saveError ? (
                <Banner tone="danger" title="Task preference not saved">
                    {props.saveError}
                </Banner>
            ) : null}
            {props.status === "unsupported" ? (
                <Banner tone="neutral" title="Task settings unavailable">
                    This connection does not provide user settings.
                </Banner>
            ) : null}
            <FormRow
                control={
                    props.status === "loading" ? (
                        <Box className="happy-agent-settings__pending">
                            <Spinner size={16} />
                            <span>Reading preference…</span>
                        </Box>
                    ) : (
                        <Box className="happy-agent-settings__pending">
                            {props.saving ? (
                                <>
                                    <Spinner size={16} />
                                    <span role="status">Saving…</span>
                                </>
                            ) : null}
                            <Switch
                                aria-label="Automatically join other people’s tasks"
                                checked={props.autoJoinEnabled === true}
                                disabled={
                                    props.status !== "ready" ||
                                    props.saving === true ||
                                    props.unavailable !== undefined ||
                                    props.error !== undefined
                                }
                                id={id}
                                onChange={props.onAutoJoinChange}
                                size="small"
                            />
                        </Box>
                    )
                }
                description="On by default. Joins existing and new tasks, except tasks you left. Turning this off keeps tasks you already joined. Your own new tasks are always joined."
                htmlFor={id}
                label="Automatically join other people’s tasks"
            />
        </HappyAgentSettingsSection>
    );
}
