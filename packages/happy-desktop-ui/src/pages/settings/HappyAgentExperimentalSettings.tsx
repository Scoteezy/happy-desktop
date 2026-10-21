import { FormRow } from "../../FormRow";
import { Switch } from "../../Switch";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentExperimentalSettingsProps {
    features: readonly { id: string; label: string; enabled: boolean }[];
    onFeatureChange: (id: string, enabled: boolean) => void;
}

export function HappyAgentExperimentalSettings(props: HappyAgentExperimentalSettingsProps) {
    return (
        <HappyAgentSettingsSection>
            {props.features.map((feature) => (
                <FormRow
                    key={feature.id}
                    label={feature.label}
                    htmlFor={`happy-agent-settings-experimental-${feature.id}`}
                    control={
                        <Switch
                            aria-label={feature.label}
                            checked={feature.enabled}
                            id={`happy-agent-settings-experimental-${feature.id}`}
                            size="small"
                            onChange={(enabled) => props.onFeatureChange(feature.id, enabled)}
                        />
                    }
                />
            ))}
        </HappyAgentSettingsSection>
    );
}
