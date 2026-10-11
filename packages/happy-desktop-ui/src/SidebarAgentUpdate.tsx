import { AgentUpdateCard, type AgentUpdateCardProps } from "./AgentUpdateCard";
import { Button } from "./Button";
import { floatingAvoidBind } from "./floatingAvoid";
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
 * Keeps the open card off the composer. Stable, so React binds it once per
 * opening rather than once per render.
 */
const panelPlace = (node: HTMLDivElement): (() => void) => floatingAvoidBind(node, 8);

/**
 * SidebarAgentUpdate — a Happy Agent update in the footer's update slot.
 *
 * It exists only while an update is under way, in the slot the orange
 * `SidebarUpdateAction` occupies before one starts: an ordinary ghost footer
 * button whose sync glyph turns slowly while the update runs, pressed while
 * its card is open. The card hangs above the footer on the same inset as the
 * update panel, and the window behind it stays fully usable.
 *
 * Open, the card never covers the composer: where it would, it rises until
 * it clears the composer's top edge, and otherwise stays at its place.
 *
 * The card stays mounted while folded or hidden, so the snail playing through
 * the update is one scene from start to end rather than one per opening.
 */
export function SidebarAgentUpdate(props: SidebarAgentUpdateProps) {
    const { expanded, hidden, onToggle, ...card } = props;
    const running = card.view.kind !== "done" && card.view.kind !== "failed";
    const label = expanded ? "Hide update progress" : "Show update progress";
    const shown = expanded && hidden !== true;
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
            <div
                className="happy-sidebar-agent-update__panel"
                hidden={!expanded}
                ref={shown ? panelPlace : undefined}
            >
                <AgentUpdateCard {...card} />
            </div>
        </div>
    );
}
