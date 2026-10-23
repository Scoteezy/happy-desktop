import type { ReactNode } from "react";
import { Button } from "../../Button";
import { PanelHeader } from "../../PanelHeader";
import { SurfaceMemberStack, type HappyAgentSurfaceView } from "./surfacePresentation";

export interface HappyAgentSurfaceHeaderProps {
    surface: HappyAgentSurfaceView;
    /** What the Surface's own page offers in its header, before the faces. */
    actions?: ReactNode;
    /** The Surface's shared chat, opened beside it; absent for a type that has none. */
    chat?: HappyAgentSurfaceChatToggle;
}

/** Whether a Surface's shared chat is open beside it, and how to open or close it. */
export interface HappyAgentSurfaceChatToggle {
    readonly open: boolean;
    readonly onToggle: () => void;
    /**
     * The chat's agent is working, whether or not the chat is open, so the
     * reader sees the work they asked for go on from the Surface itself.
     */
    readonly working?: boolean;
}

/**
 * The header band of one Surface, whatever its type: one line with its name,
 * who made it when that is known, and the faces of who is in it. Joining and
 * leaving belong to its row in the sidebar.
 *
 * It is the window's shared header band (`PanelHeader`), so it is a chat
 * header's height and the row the window is dragged by. Who made it is
 * secondary text, dropped first when the band is narrow.
 */
export function HappyAgentSurfaceHeader(props: HappyAgentSurfaceHeaderProps) {
    const creator = props.surface.creator;
    // An artifact, bot, or task was made elsewhere; who kept it here only added it.
    const kind = props.surface.type.kind;
    const credit =
        kind === "artifact" || kind === "bot" || kind === "task" ? "Added by" : "Created by";
    // A chat Surface is itself a chat among people, so the one with its agent
    // is named for the agent rather than as a second chat.
    const agentChat = kind === "chat";
    return (
        <PanelHeader className="happy-agent-surface-header">
            <div className="happy-agent-surface-header__lead">
                <h1 className="happy-agent-surface-header__title">{props.surface.name}</h1>
                {creator ? (
                    <>
                        <span aria-hidden="true" className="happy-agent-surface-header__dot" />
                        <span className="happy-agent-surface-header__creator">
                            {credit} {creator.name}
                        </span>
                    </>
                ) : null}
            </div>
            {props.actions === undefined ? null : (
                <div className="happy-agent-surface-header__actions">{props.actions}</div>
            )}
            <SurfaceMemberStack members={props.surface.members} />
            {/* At the edge the chat opens from. */}
            {props.chat ? (
                <Button
                    aria-pressed={props.chat.open}
                    className="happy-agent-surface-header__chat"
                    data-testid="happy-agent-surface-chat-toggle"
                    icon={agentChat ? "spark" : "chat"}
                    onClick={props.chat.onToggle}
                    size="small"
                    working={props.chat.working === true}
                    title={
                        props.chat.open
                            ? "Close the chat"
                            : agentChat
                              ? "Open the chat with the agent everyone here shares"
                              : "Open the chat everyone here shares"
                    }
                    variant="ghost"
                >
                    {agentChat ? "Agent" : "Chat"}
                </Button>
            ) : null}
        </PanelHeader>
    );
}
