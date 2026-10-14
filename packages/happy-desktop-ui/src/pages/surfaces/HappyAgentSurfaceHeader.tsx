import { Button } from "../../Button";
import { PanelHeader } from "../../PanelHeader";
import {
    SurfaceAvatar,
    SurfaceMemberStack,
    surfaceMembersText,
    surfaceTypeLabel,
    type HappyAgentSurfaceView,
} from "./surfacePresentation";

export interface HappyAgentSurfaceHeaderProps {
    surface: HappyAgentSurfaceView;
    onJoin: () => void;
    onLeave: () => void;
}

/**
 * The header band of one Surface, whatever its type: its picture, its name
 * over what it is and who is in it, their faces, and the one membership act
 * that applies — Leave when it is in the reader's sidebar, Join when it is
 * not.
 *
 * It is the window's shared header band (`PanelHeader`), so it is a chat
 * header's height and the row the window is dragged by.
 */
export function HappyAgentSurfaceHeader(props: HappyAgentSurfaceHeaderProps) {
    const surface = props.surface;
    return (
        <PanelHeader className="happy-agent-surface-header">
            <SurfaceAvatar image={surface.image} size="sm" type={surface.type} />
            <div className="happy-agent-surface-header__heading">
                <h1 className="happy-agent-surface-header__title">{surface.name}</h1>
                <span className="happy-agent-surface-header__subtitle">
                    {surfaceTypeLabel(surface.type)} · {surfaceMembersText(surface.members)}
                </span>
            </div>
            <div className="happy-agent-surface-header__trailing">
                <SurfaceMemberStack members={surface.members} />
                {surface.joined ? (
                    <Button
                        data-testid="happy-agent-surface-leave"
                        loading={surface.membershipPending === true}
                        onClick={props.onLeave}
                        size="small"
                        variant="ghost"
                    >
                        Leave
                    </Button>
                ) : (
                    <Button
                        data-testid="happy-agent-surface-join"
                        loading={surface.membershipPending === true}
                        onClick={props.onJoin}
                        size="small"
                        variant="primary"
                    >
                        Join
                    </Button>
                )}
            </div>
        </PanelHeader>
    );
}
