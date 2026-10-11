import { AgentUpdateCard, type AgentUpdateCardProps } from "./AgentUpdateCard";
import { Button } from "./Button";
import { Ionicon } from "./vectorIcons/VectorIcon";

export type SidebarAgentUpdateProps = AgentUpdateCardProps & {
    /** Whether the card is open above the footer. */
    readonly expanded: boolean;
    /** Opens or folds the card. */
    onToggle(): void;
};

/**
 * SidebarAgentUpdate — a Happy Agent update in the footer's update slot.
 *
 * It exists only while an update is under way, in the slot the orange
 * `SidebarUpdateAction` occupies before one starts: an ordinary ghost footer
 * button whose sync glyph turns slowly while the update runs, pressed while
 * its card is open. The card hangs above the footer on the same inset as the
 * update panel, and the window behind it stays fully usable.
 *
 * The card stays mounted while folded, so the snail playing through the update
 * is one scene from start to end rather than one per opening.
 */
export function SidebarAgentUpdate(props: SidebarAgentUpdateProps) {
    const { expanded, onToggle, ...card } = props;
    const running = card.view.kind !== "done" && card.view.kind !== "failed";
    const label = expanded ? "Hide update progress" : "Show update progress";
    return (
        <div
            className="happy-sidebar-agent-update"
            data-happy-desktop-ui="sidebar-agent-update"
            data-open={expanded ? "" : undefined}
            data-running={running ? "" : undefined}
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
