import type { ReactNode } from "react";
import { PanelHeader } from "../../PanelHeader";
import { SurfaceMemberStack, type HappyAgentSurfaceView } from "./surfacePresentation";

export interface HappyAgentSurfaceHeaderProps {
    surface: HappyAgentSurfaceView;
    /** What the Surface's own page offers in its header, before the faces. */
    actions?: ReactNode;
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
    return (
        <PanelHeader className="happy-agent-surface-header">
            <div className="happy-agent-surface-header__lead">
                <h1 className="happy-agent-surface-header__title">{props.surface.name}</h1>
                {creator ? (
                    <>
                        <span aria-hidden="true" className="happy-agent-surface-header__dot" />
                        <span className="happy-agent-surface-header__creator">
                            Created by {creator.name}
                        </span>
                    </>
                ) : null}
            </div>
            {props.actions === undefined ? null : (
                <div className="happy-agent-surface-header__actions">{props.actions}</div>
            )}
            <SurfaceMemberStack members={props.surface.members} />
        </PanelHeader>
    );
}
