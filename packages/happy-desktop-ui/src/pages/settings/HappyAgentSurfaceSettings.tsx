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
            label="Automatically join other people’s Surfaces"
            description="On by default. Joins existing and new Surfaces, except Surfaces you left. Turning this off keeps Surfaces you already joined. Your own new Surfaces are always joined."
            unsupportedMessage="Update this connection’s Happy Agent to change Surface autojoin."
        />
    );
}
