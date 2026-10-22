import {
    HappyAgentAutoJoinSettings,
    type HappyAgentAutoJoinSettingsProps,
} from "./HappyAgentAutoJoinSettings";

export type HappyAgentSurfaceSettingsProps = HappyAgentAutoJoinSettingsProps;

/** One connection's per-user preference; the server owns all membership changes. */
export function HappyAgentSurfaceSettings(props: HappyAgentSurfaceSettingsProps) {
    return (
        <HappyAgentAutoJoinSettings
            {...props}
            entity="Surface"
            label="Automatically join other people’s shared documents, todo lists and calendars"
            description="On by default. Joins existing and new ones, except those you left. Turning this off keeps those you already joined. Your own new ones are always joined."
            unsupportedMessage="Update this connection’s Happy Agent to change this preference."
        />
    );
}
