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
                        caption="Copy"
                        copiedCaption="Copied"
                        data-happy-desktop-ui="happy-agent-raw-state-copy"
                        label="Copy raw state"
                        text={() => stateText(props.documents)}
                    />
                }
                description={`${String(props.documents.length)} store snapshots, held in this window's memory`}
                label="Copy every snapshot"
            />
        </HappyAgentSettingsSection>
    );
}

function stateText(documents: readonly HappyAgentStateDocument[]): string {
    return documents
        .map((document) => `# ${document.label} — ${document.description}\n${document.value}`)
        .join("\n\n");
}
