import { useState } from "react";
import { Box } from "../../src/Box";
import { GptLiveSettings } from "../../src/GptLiveSettings";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "P-012b";

export function GptLiveSettingsPage() {
    const [enabled, setEnabled] = useState(false);
    return (
        <ComponentPage
            number={componentNumber}
            title="GPT-Live settings"
            summary="Default-off desktop voice opt-in. This foundation has no authenticated call bridge."
        >
            <Specimen
                label="Off by default · interactive"
                number="01"
                detail="Opt-in only; no recording or connection starts."
            >
                <Box width={680}>
                    <GptLiveSettings enabled={enabled} onEnabledChange={setEnabled} />
                </Box>
            </Specimen>
            <Specimen
                label="Opted in · calling unavailable"
                number="02"
                detail="The missing authenticated bridge is stated explicitly."
            >
                <Box width={680}>
                    <GptLiveSettings enabled onEnabledChange={() => {}} />
                </Box>
            </Specimen>
        </ComponentPage>
    );
}
