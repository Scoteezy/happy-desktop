import { AgentUpdateCard, type AgentUpdateCardProps } from "./AgentUpdateCard";
import { Button } from "./Button";
import { Ionicon } from "./vectorIcons/VectorIcon";

export type SidebarAgentUpdateProps = AgentUpdateCardProps & {
    /** Whether the card is open above the footer. */
    readonly expanded: boolean;
    /**
     * Mounted but not shown yet: the scene loads while the update has nothing
     * real to say, so the card appears whole when it does.
     */
    readonly hidden?: boolean;
    /** Opens or folds the card. */
    onToggle(): void;
};

/**
 * SidebarAgentUpdate — a Happy Agent update in the footer's update slot.
 *
 * It exists only while an update is under way, in the slot the orange
 * `SidebarUpdateAction` occupies before one starts: an ordinary ghost footer
 * button whose sync glyph turns slowly while the update runs, pressed while
 * its card is open.
 *
 * The card belongs to the sidebar: it sits directly above the footer, as wide
 * as the footer's own row and inside the sidebar column, so it follows the
 * sidebar as it is resized and never reaches over the conversation beside it.
 *
 * The card stays mounted while folded or hidden, so the snail playing through
 * the update is one scene from start to end rather than one per opening.
 */
export function SidebarAgentUpdate(props: SidebarAgentUpdateProps) {
    const { expanded, hidden, onToggle, ...card } = props;
    const running = card.view.kind !== "done" && card.view.kind !== "failed";
    const label = expanded ? "Hide update progress" : "Show update progress";
    return (
        <div
            className="happy-sidebar-agent-update"
            data-happy-desktop-ui="sidebar-agent-update"
            data-open={expanded ? "" : undefined}
            data-running={running ? "" : undefined}
            hidden={hidden}
        >
            <Button
                aria-expanded={expanded}
                aria-label={label}
                iconOnly
                onClick={onToggle}
                size="small"
                title={running ? "Updating Happy Agent" : label}
                variant="ghost"
            >
                <Ionicon
                    className="happy-sidebar-agent-update__glyph"
                    name="sync-outline"
                    size={14}
                />
            </Button>
            <div className="happy-sidebar-agent-update__panel" hidden={!expanded}>
                <AgentUpdateCard {...card} />
            </div>
        </div>
    );
}
