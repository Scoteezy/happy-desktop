import type { BadgeVariant } from "../../Badge";

export type HappyAgentSettingsStatusProps = {
    label: string;
    variant?: BadgeVariant;
};

/**
 * A settings row's state: one sentence-case word at row size and a coloured
 * dot after it, so dots placed at a row's trailing edge line up in one column.
 */
export function HappyAgentSettingsStatus(props: HappyAgentSettingsStatusProps) {
    return (
        <span
            className="happy-agent-settings-status"
            data-happy-desktop-ui="happy-agent-settings-status"
            data-variant={props.variant ?? "neutral"}
        >
            <span className="happy-agent-settings-status__label">{props.label}</span>
            <span aria-hidden="true" className="happy-agent-settings-status__dot" />
        </span>
    );
}
