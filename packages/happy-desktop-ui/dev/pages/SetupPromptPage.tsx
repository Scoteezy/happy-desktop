import { SetupPage } from "../../src/SetupPage";
import { SetupPrompt } from "../../src/SetupPrompt";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-306";

const noop = () => undefined;

const prompt =
    "I'm using Happy (https://happy.engineering), and its local Happy Agent is broken: " +
    'the desktop app reports "The Happy agent answered 502." (Happy Agent 0.4.71). ' +
    "Help me diagnose and recover it. Happy Agent's source and documentation are at " +
    "https://github.com/slopus/happy-agent; its CLI is `happy-agent` with the " +
    "subcommands start, stop, kill, reload, and status.";

/** The broken-agent screen fills the window, so it gets a window-shaped frame. */
const frame = {
    border: "1px solid var(--border)",
    borderRadius: "10px",
    height: "640px",
    overflow: "hidden",
    position: "relative" as const,
    width: "100%",
};

export function SetupPromptPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A paragraph meant for another assistant: wrapped, selectable, and copied whole with one named action. Used when Happy itself cannot help, such as when its local Happy Agent is broken."
            title="Setup prompt"
        >
            <Specimen
                detail="Wraps at the setup column's measure · copy action under the text"
                label="Prompt"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "14px", width: 480 }}>
                    <SetupPrompt label="prompt" prompt={prompt} />
                    <DimensionRule label="16 / 12 padding · 13/20 text · 28 copy action" />
                </div>
            </Specimen>

            <Specimen
                detail="SetupPage with the error, one restart action, and the prompt as its body"
                label="Happy Agent broken"
                number="02"
                stage="surface"
            >
                <div style={frame}>
                    <SetupPage
                        action={{ label: "Restart Happy Agent", onSelect: noop }}
                        copy="The Happy agent answered 502."
                        scene="owl"
                        title="Happy is in a broken state"
                    >
                        <SetupPrompt label="prompt" prompt={prompt} />
                    </SetupPage>
                </div>
            </Specimen>

            <Specimen
                detail="The restart is running: the action is busy and the live line says where it is"
                label="Restarting"
                number="03"
                stage="surface"
            >
                <div style={frame}>
                    <SetupPage
                        action={{ busy: true, label: "Restart Happy Agent", onSelect: noop }}
                        copy="The Happy agent answered 502."
                        scene="owl"
                        status={{ busy: true, label: "Starting Happy Agent…" }}
                        title="Happy is in a broken state"
                    >
                        <SetupPrompt label="prompt" prompt={prompt} />
                    </SetupPage>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
