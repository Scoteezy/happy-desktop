import {
    HappyAgentAutoJoinSettings,
    type HappyAgentAutoJoinSettingsProps,
} from "./HappyAgentAutoJoinSettings";

export type HappyAgentTaskSettingsProps = HappyAgentAutoJoinSettingsProps;

/** One connection's per-user preference; the server owns all membership changes. */
export function HappyAgentTaskSettings(props: HappyAgentTaskSettingsProps) {
    return (
        <HappyAgentAutoJoinSettings
            {...props}
            entity="task"
            label="Join other people’s tasks"
            description="Except ones you left. Turning this off keeps the ones you joined."
        />
    );
}
