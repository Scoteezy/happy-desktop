import type { CSSProperties } from "react";
import { Button } from "./Button";

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
            <Button
                aria-pressed={props.hideIdle}
                data-filter="idle"
                icon="filter"
                onClick={props.onHideIdleToggle}
                size="small"
                variant={props.hideIdle ? "secondary" : "ghost"}
            >
                Idle
            </Button>
            <Button
                aria-pressed={props.hideBots}
                data-filter="bots"
                icon="agents"
                onClick={props.onHideBotsToggle}
                size="small"
                variant={props.hideBots ? "secondary" : "ghost"}
            >
                Bots
            </Button>
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
