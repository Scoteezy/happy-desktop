import { useState } from "react";
import { Icon } from "./Icon";
import { MarkdownDocument } from "./MarkdownDocument";
import { ScrollArea } from "./Scrollbar";

export type ConversationSummaryRowProps = {
    kind: "tools" | "handoff" | "batch";
    label: string;
    details: readonly string[];
    /** The complete supplied report behind this summary. */
    document?: string;
    expanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
};

/** One supplied plain-language summary; its source details stay one click away. */
export function ConversationSummaryRow(props: ConversationSummaryRowProps) {
    const [ownExpanded, setOwnExpanded] = useState(false);
    const expanded = props.expanded ?? ownExpanded;
    return (
        <div
            className="happy-conversation-summary"
            data-happy-desktop-ui="conversation-summary"
            data-kind={props.kind}
        >
            <button
                aria-expanded={expanded}
                className="happy-conversation-summary__toggle"
                onClick={() => {
                    setOwnExpanded(!expanded);
                    props.onExpandedChange?.(!expanded);
                }}
                type="button"
            >
                <Icon
                    name={
                        props.kind === "handoff"
                            ? "chat"
                            : props.kind === "batch"
                              ? "list"
                              : "terminal"
                    }
                    size={14}
                />
                <span title={props.label}>{props.label}</span>
                <Icon name={expanded ? "chevron-down" : "chevron-right"} size={12} />
            </button>
            {expanded && props.details.length > 0 ? (
                <ul className="happy-conversation-summary__details">
                    {props.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                    ))}
                </ul>
            ) : null}
            {expanded && props.document ? (
                <ScrollArea className="happy-conversation-summary__document">
                    <MarkdownDocument text={props.document} />
                </ScrollArea>
            ) : null}
        </div>
    );
}
