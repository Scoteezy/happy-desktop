import { PanelHeader } from "../../PanelHeader";
import { SurfaceMemberStack, type HappyAgentSurfaceView } from "./surfacePresentation";

export interface HappyAgentSurfaceHeaderProps {
    surface: HappyAgentSurfaceView;
}

/**
 * The header band of one Surface, whatever its type: one line with its name
 * and the faces of who is in it. Joining and leaving belong to its row in the
 * sidebar.
 *
 * It is the window's shared header band (`PanelHeader`), so it is a chat
 * header's height and the row the window is dragged by.
 */
export function HappyAgentSurfaceHeader(props: HappyAgentSurfaceHeaderProps) {
    return (
        <PanelHeader className="happy-agent-surface-header">
            <h1 className="happy-agent-surface-header__title">{props.surface.name}</h1>
            <SurfaceMemberStack members={props.surface.members} />
        </PanelHeader>
    );
}
