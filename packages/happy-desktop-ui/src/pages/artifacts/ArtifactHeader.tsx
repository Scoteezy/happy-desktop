import type { ReactNode } from "react";
import { PanelHeader } from "../../PanelHeader";

export interface ArtifactHeaderProps {
    /** Names the band for the shell's header lane rules. */
    className: string;
    /** An edge-docked control before the title, such as Back. */
    leading?: ReactNode;
    title: string;
    /** A short line beside the title: what the surface holds. */
    subtitle?: string;
    /** Controls at the trailing edge. */
    trailing?: ReactNode;
}

/**
 * The header band of an artifacts surface.
 *
 * It is the window's shared header band (`PanelHeader`) rather than a surface
 * toolbar of its own, so it is exactly as tall as a chat's header — 56px, and
 * the 40px window-chrome row where the window draws its own title bar — it is
 * the row the window is dragged by, and its controls are carved out of that
 * row the same way every other header's are.
 */
export function ArtifactHeader(props: ArtifactHeaderProps) {
    return (
        <PanelHeader className={props.className} edgeControl={props.leading !== undefined}>
            {props.leading}
            <div className="happy-agent-artifact-header__heading">
                <h1 className="happy-agent-artifact-header__title">{props.title}</h1>
                {props.subtitle ? (
                    <span className="happy-agent-artifact-header__subtitle">{props.subtitle}</span>
                ) : null}
            </div>
            {props.trailing ? (
                <div className="happy-agent-artifact-header__trailing">{props.trailing}</div>
            ) : null}
        </PanelHeader>
    );
}
