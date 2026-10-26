import type { CSSProperties } from "react";
import { CopyButton } from "../../CopyButton";
import { FormRow } from "../../FormRow";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentDebugLogPanelEntry {
    readonly detail?: string;
    readonly id: number;
    readonly level: "info" | "warning" | "error";
    readonly message: string;
    readonly occurredAt: number;
    readonly source: "catalog" | "connection" | "health" | "mutation" | "sse" | "sync";
}

export interface HappyAgentDebugLogPanelProps {
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly discardedEntries: number;
    readonly entries: readonly HappyAgentDebugLogPanelEntry[];
    /**
     * Saves the log to a file and resolves with its path, which the button copies
     * instead of the text. Absent where the host cannot save a file.
     */
    readonly onPathWrite?: (text: string) => Promise<string>;
    readonly style?: CSSProperties;
}

function entryText(entry: HappyAgentDebugLogPanelEntry): string {
    const heading = `${new Date(entry.occurredAt).toISOString()} [${entry.level.toUpperCase()}] [${entry.source.toUpperCase()}] ${entry.message}`;
    if (entry.detail === undefined) return heading;
    return `${heading}\n${entry.detail
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n")}`;
}

function logText(props: HappyAgentDebugLogPanelProps): string {
    const entries = props.entries.map(entryText);
    if (props.discardedEntries > 0) {
        entries.unshift(
            `… ${props.discardedEntries.toLocaleString("en-US")} earlier ${props.discardedEntries === 1 ? "entry" : "entries"} discarded from the retained buffer`,
        );
    }
    return entries.join("\n\n");
}

/**
 * Connection and state diagnostics for one Happy Agent, handed over whole rather
 * than shown. The retained buffer lives only in this window's memory, so it is
 * one copy away from a bug report; the count says how much it holds right now.
 */
export function HappyAgentDebugLogPanel(props: HappyAgentDebugLogPanelProps) {
    const count = props.entries.length;
    return (
        <HappyAgentSettingsSection title="State log">
            <div
                className={props.className}
                data-happy-desktop-ui="happy-agent-debug-log"
                data-testid={props["data-testid"]}
                style={props.style}
            >
                <FormRow
                    control={
                        <CopyButton
                            caption={props.onPathWrite ? "Copy path" : "Copy"}
                            copiedCaption="Copied"
                            data-happy-desktop-ui="happy-agent-debug-log-copy"
                            label={
                                props.onPathWrite ? "Copy debug log file path" : "Copy debug log"
                            }
                            text={() =>
                                props.onPathWrite
                                    ? props.onPathWrite(logText(props))
                                    : logText(props)
                            }
                        />
                    }
                    description={`${count.toLocaleString("en-US")} ${count === 1 ? "entry" : "entries"} retained: connection changes, reconciliation, raw events and failed mutations`}
                    label="The log"
                />
            </div>
        </HappyAgentSettingsSection>
    );
}
