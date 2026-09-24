import { useState, type CSSProperties } from "react";
import { Icon } from "./Icon";
import type { KeyboardShortcut } from "./keyboardShortcut";
import { TextField } from "./TextField";
import { Tooltip } from "./Tooltip";

/** Which of the sidebar's two lists is up. */
export type SidebarListView = "workspaces" | "attention";

export interface SidebarListBarProps {
    /** Which list the sidebar is showing. */
    readonly view: SidebarListView;
    readonly onViewSelect: (view: SidebarListView) => void;
    /** How many conversations are waiting on the reader, worn by the bell. */
    readonly attentionCount?: number;
    /** The chord that does what the bell does, shown on its tooltip. */
    readonly attentionShortcut?: KeyboardShortcut;
    /** The chord that opens the search, shown on its tooltip. */
    readonly searchShortcut?: KeyboardShortcut;
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
 * section. It names the list the column is showing, "Workspaces" or
 * "Attention", and holds the two controls that act on it: the bell, which
 * switches between the two and wears the waiting count, and search.
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
    // The field folds away rather than vanishing, so it outlives the search
    // by one animation. Which way the search last went is tracked during
    // render — the documented way to react to a prop changing without an
    // effect — and the fold-out ending is what finally takes the field down.
    const [wasOpen, setWasOpen] = useState(props.searchOpen);
    const [closing, setClosing] = useState(false);
    if (wasOpen !== props.searchOpen) {
        setWasOpen(props.searchOpen);
        setClosing(!props.searchOpen);
    }
    const fieldShown = props.searchOpen || closing;
    return (
        <div
            className={["happy-sidebar-list-bar", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="sidebar-list-bar"
            data-search={props.searchOpen ? "" : undefined}
            data-testid={props["data-testid"]}
            data-view={props.view}
            style={props.style}
        >
            <span
                className="happy-sidebar-list-bar__title"
                data-happy-desktop-ui="sidebar-list-bar-title"
            >
                {props.view === "attention" ? "Attention" : "Workspaces"}
            </span>
            <div className="happy-sidebar-list-bar__controls">
                {/* Each control explains itself on hover with its words and its
                    chord, the way the palette does, so the chord is learned
                    where the control is rather than from a sheet. */}
                <Tooltip
                    label="Search sessions"
                    {...(props.searchShortcut ? { shortcut: props.searchShortcut } : {})}
                >
                    <button
                        aria-keyshortcuts={props.searchShortcut?.aria}
                        aria-label="Search sessions"
                        className="happy-sidebar-list-bar__control"
                        data-control="search"
                        onClick={props.onSearchOpen}
                        type="button"
                    >
                        <Icon name="search" size={16} />
                    </button>
                </Tooltip>
                <Tooltip
                    label={
                        props.view === "attention" ? "Show every workspace" : "Show what needs you"
                    }
                    {...(props.attentionShortcut ? { shortcut: props.attentionShortcut } : {})}
                >
                    <button
                        aria-keyshortcuts={props.attentionShortcut?.aria}
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
                            props.onViewSelect(
                                props.view === "attention" ? "workspaces" : "attention",
                            )
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
                </Tooltip>
            </div>
            {fieldShown ? (
                <div
                    className="happy-sidebar-list-bar__search"
                    data-closing={props.searchOpen ? undefined : ""}
                    data-happy-desktop-ui="sidebar-list-bar-search"
                    onAnimationEnd={(event) => {
                        if (event.animationName === "happy-sidebar-list-bar-search-out")
                            setClosing(false);
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== "Escape") return;
                        event.preventDefault();
                        event.stopPropagation();
                        props.onSearchClose();
                    }}
                >
                    <TextField
                        autoFocus={props.searchOpen}
                        disabled={!props.searchOpen}
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
