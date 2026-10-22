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
            label="Automatically join other people’s tasks"
            description="On by default. Joins existing and new tasks, except tasks you left. Turning this off keeps tasks you already joined. Your own new tasks are always joined."
        />
    );
}
