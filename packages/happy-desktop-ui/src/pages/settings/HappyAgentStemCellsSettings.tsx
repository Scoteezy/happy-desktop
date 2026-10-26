import { useId } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { FormRow } from "../../FormRow";
import { Spinner } from "../../Spinner";
import { Switch } from "../../Switch";

export interface HappyAgentStemCellsSettingsProps {
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
 * A person's opt-in to Stem Cells on one connection: the Spaces sidebar, new
 * work made as stem cells, and Prioritizing, which files it into the sidebar.
 */
export function HappyAgentStemCellsSettings(props: HappyAgentStemCellsSettingsProps) {
    const id = useId();
    return (
        // Rows only: HappyAgentConnectionSettingsSection names the connection
        // and says once when it is unreachable; `unavailable` only disables here.
        <>
            {props.error ? (
                <Banner tone="danger" title="Stem Cells settings unavailable">
                    {props.error}
                </Banner>
            ) : null}
            {props.saveError ? (
                <Banner tone="danger" title="Stem Cells preference not saved">
                    {props.saveError}
                </Banner>
            ) : null}
            {props.status === "unsupported" ? (
                <Banner tone="neutral" title="Stem Cells settings unavailable">
                    This connection does not provide user settings.
                </Banner>
            ) : null}
            <FormRow
                label="Stem cells"
                description="The new sidebar, with Create at the top and your work filed into topics"
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
                            aria-label={`Stem cells — ${props.connectionLabel}`}
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
        </>
    );
}
