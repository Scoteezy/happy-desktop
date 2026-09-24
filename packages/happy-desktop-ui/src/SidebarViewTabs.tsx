import type { CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";

/** Which of the sidebar's two lists is up. */
export type SidebarView = "workspaces" | "attention";

export interface SidebarViewTabsProps {
    /** Which list the sidebar is showing. */
    readonly view: SidebarView;
    readonly onViewSelect: (view: SidebarView) => void;
    /** How many conversations are waiting on the reader, worn by the attention tab. */
    readonly attentionCount?: number;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

/**
 * SidebarViewTabs — the two tabs that choose which list the sidebar shows:
 * every workspace, or what is waiting on the reader followed by everything
 * recent. They are alternatives of one place, told apart by weight, because
 * the attention list is the same sidebar showing a different cut and the
 * screen beside it does not change. The attention tab wears the queue's
 * count, so the reader sees something is waiting without switching to look.
 *
 * Each tab is laid out on the sidebar row's own grid — the row's inset, a
 * 16px glyph in the row's 20px slot, the row's 8px gap — so its icon and
 * label stand on the same vertical lines as the rows beneath it. A segmented
 * control brings its own padding and glyph size, and neither is the row's,
 * which is why the tabs are drawn here.
 */
export function SidebarViewTabs(props: SidebarViewTabsProps) {
    const waiting = props.attentionCount ?? 0;
    return (
        <div
            aria-label="Sidebar list"
            className={["happy-sidebar-view-tabs", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="sidebar-view-tabs"
            data-testid={props["data-testid"]}
            data-view={props.view}
            role="tablist"
            style={props.style}
        >
            <ViewTab
                icon="branch"
                label="Workspaces"
                onSelect={() => props.onViewSelect("workspaces")}
                selected={props.view === "workspaces"}
                view="workspaces"
            />
            <ViewTab
                icon="bell"
                label={waiting > 0 ? `Attention · ${waiting}` : "Attention"}
                onSelect={() => props.onViewSelect("attention")}
                selected={props.view === "attention"}
                view="attention"
            />
        </div>
    );
}

interface ViewTabProps {
    readonly icon: IconName;
    readonly label: string;
    readonly onSelect: () => void;
    readonly selected: boolean;
    readonly view: SidebarView;
}

/** One of the two lists, named on the row grid; the one that is up is the heavier. */
function ViewTab(props: ViewTabProps) {
    return (
        <button
            aria-selected={props.selected}
            className="happy-sidebar-view-tabs__tab"
            data-view={props.view}
            onClick={props.onSelect}
            role="tab"
            type="button"
        >
            <span className="happy-sidebar-view-tabs__slot">
                <Icon name={props.icon} size={16} />
            </span>
            <span className="happy-sidebar-view-tabs__label">{props.label}</span>
        </button>
    );
}
