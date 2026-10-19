import { useState } from "react";
import { Icon } from "./Icon";

export type ConversationSummaryRowProps = {
    kind: "tools" | "handoff";
    label: string;
    details: readonly string[];
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
                <Icon name={props.kind === "handoff" ? "chat" : "terminal"} size={14} />
                <span>{props.label}</span>
                <Icon name={expanded ? "chevron-down" : "chevron-right"} size={12} />
            </button>
            {expanded ? (
                <ul className="happy-conversation-summary__details">
                    {props.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
