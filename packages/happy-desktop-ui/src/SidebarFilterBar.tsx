import type { CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";
import { SegmentedControl } from "./SegmentedControl";

/** Which of the sidebar's two lists is up. */
export type SidebarFilterView = "workspaces" | "attention";

export interface SidebarFilterBarProps {
    /** Which list the sidebar is showing. */
    readonly view: SidebarFilterView;
    readonly onViewSelect: (view: SidebarFilterView) => void;
    /** How many conversations are waiting on the reader, worn by the attention segment. */
    readonly attentionCount?: number;
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
 * SidebarFilterBar — the switch between the sidebar's two lists, and under
 * the workspace list, the two switches that keep it to what is being worked
 * on: leave out idle rows, leave out resting bots.
 *
 * The view switch is a segmented control because the two lists are
 * alternatives of one place, not pages: the attention list is the same
 * sidebar showing only what is waiting, and the screen beside it does not
 * change. The attention segment wears the queue's count, so the reader can
 * see something is waiting without switching to look.
 *
 * The filter switches are pressed-or-not controls rather than a menu, because
 * the reader flips them several times a day and a menu is a trip for
 * something that should be a glance. They apply to the workspace list only,
 * so the attention list does not show them. The bar says how many rows the
 * filters are hiding, so an empty-looking list is never mistaken for an
 * empty list.
 */
export function SidebarFilterBar(props: SidebarFilterBarProps) {
    const hidden = props.hiddenCount ?? 0;
    const waiting = props.attentionCount ?? 0;
    return (
        <div
            className={["happy-sidebar-filter-bar", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="sidebar-filter-bar"
            data-testid={props["data-testid"]}
            data-view={props.view}
            role="group"
            aria-label="Sidebar filters"
            style={props.style}
        >
            <div className="happy-sidebar-filter-bar__view">
                <SegmentedControl
                    aria-label="Sidebar list"
                    fullWidth
                    onChange={(value) =>
                        props.onViewSelect(value === "attention" ? "attention" : "workspaces")
                    }
                    segments={[
                        { icon: "branch", label: "Workspaces", value: "workspaces" },
                        {
                            icon: "bell",
                            label: waiting > 0 ? `Attention · ${waiting}` : "Attention",
                            value: "attention",
                        },
                    ]}
                    size="small"
                    value={props.view}
                />
            </div>
            {props.view === "workspaces" ? (
                <div className="happy-sidebar-filter-bar__filters">
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
 * rather than a category on offer. It is laid out on the sidebar row's own
 * grid — the row's inset, a 16px glyph in the row's 20px slot, the row's 8px
 * gap — so its icon and label fall on the same vertical lines as the rows
 * above and below it.
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
