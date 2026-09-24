import type { CSSProperties } from "react";
import { Icon } from "./Icon";
import { TextField } from "./TextField";

/** Which of the sidebar's two lists is up. */
export type SidebarListView = "workspaces" | "attention";

export interface SidebarListBarProps {
    /** Which list the sidebar is showing. */
    readonly view: SidebarListView;
    readonly onViewSelect: (view: SidebarListView) => void;
    /** How many conversations are waiting on the reader, worn by the bell. */
    readonly attentionCount?: number;
    /** Whether the bar has become the search field. */
    readonly searchOpen: boolean;
    readonly searchQuery: string;
    readonly onSearchOpen: () => void;
    /** Escape, the search control, or leaving the field empty hands the bar back. */
    readonly onSearchClose: () => void;
    readonly onSearchQueryUpdate: (value: string) => void;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

/**
 * SidebarListBar — the row that heads the sidebar's list, above its first
 * section. It names the two lists the column can be, "Workspaces" and
 * "Attention", with the one that is up in full strength and either one a
 * tap away; and it holds the two controls that act on the list: the bell,
 * which is the same switch with the waiting count on it, and search.
 *
 * Search takes the whole row. Pressing it swaps the names and controls for
 * one field across the bar's width, unfolding from the control's corner so
 * the field reads as the control opened rather than a new row arriving; the
 * field takes the focus as it lands, so the reader is already typing. Escape
 * closes it, so does the control, and so does leaving it with nothing typed,
 * because an empty field left open is a row of chrome saying nothing.
 *
 * Everything sits on the sidebar row's own inset, so the first name stands on
 * the rows' line and the controls range against the rows' trailing edge.
 */
export function SidebarListBar(props: SidebarListBarProps) {
    const waiting = props.attentionCount ?? 0;
    return (
        <div
            className={["happy-sidebar-list-bar", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="sidebar-list-bar"
            data-search={props.searchOpen ? "" : undefined}
            data-testid={props["data-testid"]}
            data-view={props.view}
            style={props.style}
        >
            <div aria-label="Sidebar list" className="happy-sidebar-list-bar__modes" role="tablist">
                <ModeTab
                    label="Workspaces"
                    onSelect={() => props.onViewSelect("workspaces")}
                    selected={props.view === "workspaces"}
                    view="workspaces"
                />
                <span aria-hidden="true" className="happy-sidebar-list-bar__divider" />
                <ModeTab
                    label="Attention"
                    onSelect={() => props.onViewSelect("attention")}
                    selected={props.view === "attention"}
                    view="attention"
                />
            </div>
            <div className="happy-sidebar-list-bar__controls">
                <button
                    aria-label="Search sessions"
                    className="happy-sidebar-list-bar__control"
                    data-control="search"
                    onClick={props.onSearchOpen}
                    title="Search sessions"
                    type="button"
                >
                    <Icon name="search" size={16} />
                </button>
                <button
                    aria-label={
                        props.view === "attention"
                            ? "Show every workspace"
                            : waiting > 0
                              ? `Show what needs you (${String(waiting)})`
                              : "Show what needs you"
                    }
                    aria-pressed={props.view === "attention"}
                    className="happy-sidebar-list-bar__control"
                    data-control="attention"
                    onClick={() =>
                        props.onViewSelect(props.view === "attention" ? "workspaces" : "attention")
                    }
                    title={
                        props.view === "attention" ? "Show every workspace" : "Show what needs you"
                    }
                    type="button"
                >
                    <Icon name="bell" size={16} />
                    {waiting > 0 ? (
                        <span
                            className="happy-sidebar-list-bar__count"
                            data-happy-desktop-ui="sidebar-list-bar-count"
                        >
                            {waiting > 99 ? "99+" : String(waiting)}
                        </span>
                    ) : null}
                </button>
            </div>
            {props.searchOpen ? (
                <div
                    className="happy-sidebar-list-bar__search"
                    data-happy-desktop-ui="sidebar-list-bar-search"
                    onKeyDown={(event) => {
                        if (event.key !== "Escape") return;
                        event.preventDefault();
                        event.stopPropagation();
                        props.onSearchClose();
                    }}
                >
                    <TextField
                        autoFocus
                        fullWidth
                        leadingIcon="search"
                        onBlur={() => {
                            if (props.searchQuery.trim() === "") props.onSearchClose();
                        }}
                        onValueChange={props.onSearchQueryUpdate}
                        placeholder="Search sessions"
                        size="small"
                        value={props.searchQuery}
                    />
                    <button
                        aria-label="Close search"
                        className="happy-sidebar-list-bar__control happy-sidebar-list-bar__search-close"
                        data-control="search-close"
                        onClick={props.onSearchClose}
                        title="Close search"
                        type="button"
                    >
                        <Icon name="close" size={14} />
                    </button>
                </div>
            ) : null}
        </div>
    );
}

interface ModeTabProps {
    readonly label: string;
    readonly onSelect: () => void;
    readonly selected: boolean;
    readonly view: SidebarListView;
}

/** One of the two list names; the one that is up is the heavier. */
function ModeTab(props: ModeTabProps) {
    return (
        <button
            aria-selected={props.selected}
            className="happy-sidebar-list-bar__mode"
            data-view={props.view}
            onClick={props.onSelect}
            role="tab"
            type="button"
        >
            {props.label}
        </button>
    );
}
