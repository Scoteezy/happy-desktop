import { useId } from "react";
import { Banner } from "./Banner";
import { FormRow } from "./FormRow";
import { Switch } from "./Switch";
import { HappyAgentSettingsSection } from "./pages/settings/HappyAgentSettingsShell";

export interface GptLiveSettingsProps {
    enabled: boolean;
    onEnabledChange(enabled: boolean): void;
}

/** The honest opt-in surface until an authenticated GPT-Live bridge is available. */
export function GptLiveSettings(props: GptLiveSettingsProps) {
    const switchId = useId();
    return (
        <HappyAgentSettingsSection
            description="Experimental voice control for the desktop. Separate from your coding sessions and their models."
            title="GPT-Live voice"
            rows="cards"
        >
            <FormRow
                control={
                    <Switch
                        aria-label="Enable GPT-Live voice"
                        checked={props.enabled}
                        id={switchId}
                        onChange={props.onEnabledChange}
                        size="small"
                    />
                }
                description="Off by default. Enabling saves your preference; it does not start a call."
                htmlFor={switchId}
                label="Enable GPT-Live voice"
            />
            <Banner tone="neutral" title="GPT-Live calling is not available yet">
                This build does not have a GPT-Live connection. No microphone is opened and no
                desktop context is sent. Running tasks are unaffected.
            </Banner>
        </HappyAgentSettingsSection>
    );
}
