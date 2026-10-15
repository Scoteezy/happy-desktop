import type { CSSProperties } from "react";
import type { HappyAgentSurfaceType } from "happy-desktop-state";
import { EmptyState } from "../../EmptyState";
import { HappyAgentSurfaceHeader } from "./HappyAgentSurfaceHeader";
import { surfaceTypeIcon } from "./surfacePresentation";

export interface HappyAgentSurfaceNotMadePageProps {
    /** The name it was asked for under. */
    name: string;
    type: HappyAgentSurfaceType;
    /** Why the Happy Agent turned it down, in words for the reader. */
    reason: string;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/**
 * HappyAgentSurfaceNotMadePage — a Surface the reader asked for, opened at
 * once, that the Happy Agent then turned down. Its row has already left the
 * sidebar; the page stays on the name it was asked for and says why, quietly,
 * instead of going blank under the reader.
 */
export function HappyAgentSurfaceNotMadePage(props: HappyAgentSurfaceNotMadePageProps) {
    return (
        <div
            className={["happy-agent-surface-not-made", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-surface-not-made"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <HappyAgentSurfaceHeader
                surface={{ name: props.name, type: props.type, members: [] }}
            />
            <div className="happy-agent-surface-not-made__body">
                <EmptyState
                    description={props.reason}
                    icon={surfaceTypeIcon(props.type)}
                    size="panel"
                    title={`“${props.name}” wasn’t made`}
                />
            </div>
        </div>
    );
}
