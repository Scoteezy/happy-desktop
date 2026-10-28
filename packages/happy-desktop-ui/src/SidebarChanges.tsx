import type { ReactNode } from "react";
import { Button } from "./Button";

export interface SidebarChangesProps {
    /** Who proposed the changes, which Chat opens; read by assistive software. */
    readonly proposer: string;
    /** An answer to all of them is on its way; the buttons wait, its own spins. */
    readonly answering?: "accept" | "reject";
    /** Why the last answer did not go through, before the buttons until the next. */
    readonly notice?: string;
    /** Takes every change still shown. */
    readonly onAccept: () => void;
    /** Leaves the sidebar as it is and drops every change still shown. */
    readonly onReject: () => void;
    /** Opens the conversation that proposed them, to answer it in words. */
    readonly onChat: () => void;
}

/**
 * C-318 SidebarChanges — the answer to everything proposed for the sidebar at
 * once, floating over the foot of its rows: Accept, Reject and Chat as three
 * equal, quiet buttons. It is the sidebar's `bodyFloat`. One row's change is
 * accepted from that row's own mark; this takes or drops the rest, and Chat
 * opens the proposer's conversation.
 */
export function SidebarChanges(props: SidebarChangesProps): ReactNode {
    const waiting = props.answering !== undefined;
    const compact = props.notice !== undefined;
    return (
        <section
            aria-busy={waiting ? true : undefined}
            aria-label={`Sidebar changes ${props.proposer} proposed`}
            className="happy-sidebar-changes"
            data-happy-desktop-ui="sidebar-changes"
        >
            {props.notice !== undefined ? (
                <span
                    className="happy-sidebar-changes__notice"
                    data-happy-desktop-ui="sidebar-changes-notice"
                    role="alert"
                >
                    {props.notice}
                </span>
            ) : null}
            <Button
                aria-label={compact ? "Accept" : undefined}
                data-action="accept"
                disabled={waiting}
                icon="check"
                iconOnly={compact}
                loading={props.answering === "accept"}
                onClick={props.onAccept}
                size="small"
                variant="ghost"
            >
                {compact ? undefined : "Accept"}
            </Button>
            <Button
                aria-label={compact ? "Reject" : undefined}
                data-action="reject"
                disabled={waiting}
                icon="close"
                iconOnly={compact}
                loading={props.answering === "reject"}
                onClick={props.onReject}
                size="small"
                variant="ghost"
            >
                {compact ? undefined : "Reject"}
            </Button>
            <Button
                aria-label={compact ? `Chat with ${props.proposer}` : undefined}
                data-action="chat"
                disabled={waiting}
                icon="chat"
                iconOnly={compact}
                onClick={props.onChat}
                size="small"
                title={`Chat with ${props.proposer}`}
                variant="ghost"
            >
                {compact ? undefined : "Chat"}
            </Button>
        </section>
    );
}
