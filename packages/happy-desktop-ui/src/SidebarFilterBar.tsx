import type { CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";

export interface SidebarFilterBarProps {
    /** Rows with nothing running, waiting, or unread are left out. */
    readonly hideIdle: boolean;
    /** Bots that are neither working nor waiting on the reader are left out. */
    readonly hideBots: boolean;
    readonly onHideIdleToggle: () => void;
    readonly onHideBotsToggle: () => void;
    /** How many rows the filters are currently leaving out, said on the bar. */
    readonly hiddenCount?: number;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

/**
 * SidebarFilterBar — the two switches that keep the sidebar to what is being
 * worked on: leave out idle rows, leave out resting bots. Each is a pressed
 * or unpressed control rather than a menu, because the reader flips them
 * several times a day and a menu is a trip for something that should be a
 * glance. The bar says how many rows it is hiding, so an empty-looking list
 * is never mistaken for an empty list.
 *
 * The switches are laid out on the sidebar row's own grid — the row's inset,
 * a 16px glyph, the row's 8px gap — rather than as buttons, so their icons and
 * labels fall on the same vertical lines as the rows above and below them.
 */
export function SidebarFilterBar(props: SidebarFilterBarProps) {
    const hidden = props.hiddenCount ?? 0;
    return (
        <div
            className={["happy-sidebar-filter-bar", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="sidebar-filter-bar"
            data-testid={props["data-testid"]}
            role="group"
            aria-label="Sidebar filters"
            style={props.style}
        >
            <FilterSwitch
                filter="idle"
                icon="filter"
                label="Hide idle"
                onToggle={props.onHideIdleToggle}
                pressed={props.hideIdle}
                title={
                    props.hideIdle
                        ? "Idle workspaces are hidden. Click to show them."
                        : "Hide workspaces with nothing running, waiting, or unread"
                }
            />
            <FilterSwitch
                filter="bots"
                icon="agents"
                label="Hide bots"
                onToggle={props.onHideBotsToggle}
                pressed={props.hideBots}
                title={
                    props.hideBots
                        ? "Resting bots are hidden. Click to show them."
                        : "Hide bots that are neither working nor waiting on you"
                }
            />
            {hidden > 0 ? (
                <span
                    className="happy-sidebar-filter-bar__count"
                    data-happy-desktop-ui="sidebar-filter-bar-count"
                >
                    {hidden} hidden
                </span>
            ) : null}
        </div>
    );
}

interface FilterSwitchProps {
    readonly filter: "idle" | "bots";
    readonly icon: IconName;
    readonly label: string;
    readonly onToggle: () => void;
    readonly pressed: boolean;
    readonly title: string;
}

/**
 * One switch, named for what pressing it does. A pressed switch swaps its
 * glyph for a check, so "Hide idle" with a check reads as a rule in force
 * rather than a category on offer.
 */
function FilterSwitch(props: FilterSwitchProps) {
    return (
        <button
            aria-pressed={props.pressed}
            className="happy-sidebar-filter-bar__switch"
            data-filter={props.filter}
            onClick={props.onToggle}
            title={props.title}
            type="button"
        >
            <span className="happy-sidebar-filter-bar__switch-icon">
                <Icon name={props.pressed ? "check" : props.icon} size={16} />
            </span>
            <span className="happy-sidebar-filter-bar__switch-label">{props.label}</span>
        </button>
    );
}
