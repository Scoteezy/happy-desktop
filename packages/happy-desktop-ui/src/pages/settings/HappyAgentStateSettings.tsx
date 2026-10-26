import { CopyButton } from "../../CopyButton";
import { FormRow } from "../../FormRow";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** One named store snapshot, already serialized by whoever owns it. */
export interface HappyAgentStateDocument {
    /** What the snapshot is, in the words its owner uses. */
    readonly description: string;
    readonly id: string;
    readonly label: string;
    /** The snapshot as text. Pretty-printed JSON is what every caller sends. */
    readonly value: string;
}

export interface HappyAgentStateSettingsProps {
    readonly documents: readonly HappyAgentStateDocument[];
    /**
     * Saves the snapshots to a file and resolves with its path, which the button
     * copies instead of the text. Absent where the host cannot save a file.
     */
    readonly onPathWrite?: (text: string) => Promise<string>;
}

/**
 * Every live store snapshot this window can see, handed over whole rather than
 * shown. The snapshots live only in this window's memory, so the one useful
 * thing to do with them, pasting them into a bug report, is a single copy: each
 * store's own serialization, verbatim, under its name.
 */
export function HappyAgentStateSettings(props: HappyAgentStateSettingsProps) {
    return (
        <HappyAgentSettingsSection title="Raw state">
            <FormRow
                control={
                    <CopyButton
                        caption={props.onPathWrite ? "Copy path" : "Copy"}
                        copiedCaption="Copied"
                        data-happy-desktop-ui="happy-agent-raw-state-copy"
                        label={props.onPathWrite ? "Copy raw state file path" : "Copy raw state"}
                        text={() => {
                            const text = stateText(props.documents);
                            return props.onPathWrite ? props.onPathWrite(text) : text;
                        }}
                    />
                }
                description={
                    props.onPathWrite
                        ? `${String(props.documents.length)} store snapshots, saved to a new file on each copy`
                        : `${String(props.documents.length)} store snapshots, held in this window's memory`
                }
                label="Every snapshot"
            />
        </HappyAgentSettingsSection>
    );
}

function stateText(documents: readonly HappyAgentStateDocument[]): string {
    return documents
        .map((document) => `# ${document.label} — ${document.description}\n${document.value}`)
        .join("\n\n");
}
