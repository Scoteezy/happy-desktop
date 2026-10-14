import type { CSSProperties, ReactNode } from "react";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { PanelHeader } from "../../PanelHeader";

/** Where a Surface's shared chat is, as the panel beside the Surface shows it. */
export type HappyAgentSurfaceChatPanelState =
    /** The daemon is making the chat, or finding the one somebody already made. */
    | { readonly phase: "opening" }
    /** It could not be opened, in the daemon's or the store's words. */
    | { readonly phase: "failed"; readonly message: string }
    /** The conversation is the panel's content. */
    | { readonly phase: "open" };

export interface HappyAgentSurfaceChatPanelProps {
    /** The Surface's name, which the panel says the chat is shared within. */
    surfaceName: string;
    state: HappyAgentSurfaceChatPanelState;
    onClose: () => void;
    /** The conversation itself — transcript and composer — while the chat is open. */
    children?: ReactNode;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/**
 * HappyAgentSurfaceChatPanel — the one shared chat of a Surface, in the panel
 * column beside it. Everybody in the Surface reads and writes the same
 * conversation, and its agent works on the Surface for whoever wrote last.
 *
 * The panel only frames the chat: a header band level with the Surface's own,
 * saying whose chat this is, with a close control; under it the ordinary
 * conversation the application composes, or, while the chat is being made or
 * when it could not be, a quiet state in its place.
 */
export function HappyAgentSurfaceChatPanel(props: HappyAgentSurfaceChatPanelProps) {
    const body = () => {
        switch (props.state.phase) {
            case "opening":
                return (
                    <EmptyState
                        description="Everyone in this Surface shares one chat."
                        icon="chat"
                        size="panel"
                        title="Opening the chat…"
                    />
                );
            case "failed":
                return (
                    <EmptyState
                        description={props.state.message}
                        icon="chat"
                        size="panel"
                        title="The chat couldn’t be opened"
                    />
                );
            case "open":
                return props.children;
        }
    };
    return (
        <section
            aria-label={`Chat in ${props.surfaceName}`}
            className={["happy-agent-surface-chat", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-surface-chat"
            data-phase={props.state.phase}
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <PanelHeader className="happy-agent-surface-chat__header" edgeControl>
                <div className="happy-agent-surface-chat__lead">
                    <h2 className="happy-agent-surface-chat__title">Chat</h2>
                    <span className="happy-agent-surface-chat__scope">
                        Shared with everyone in {props.surfaceName}
                    </span>
                </div>
                <Button
                    aria-label="Close the chat"
                    icon="close"
                    iconOnly
                    onClick={props.onClose}
                    size="small"
                    variant="ghost"
                />
            </PanelHeader>
            <div className="happy-agent-surface-chat__body">{body()}</div>
        </section>
    );
}
