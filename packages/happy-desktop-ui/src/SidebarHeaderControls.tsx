import type { CSSProperties } from "react";
import { Icon } from "./Icon";

export interface SidebarHeaderControlsProps {
    /** Whether the search field is up. */
    readonly searchOpen: boolean;
    readonly onSearchToggle: () => void;
    /** Whether the sidebar is showing what is waiting rather than every workspace. */
    readonly attentionOn: boolean;
    readonly onAttentionToggle: () => void;
    /** How many conversations are waiting on the reader, worn by the bell. */
    readonly attentionCount?: number;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

/**
 * SidebarHeaderControls — the two controls at the trailing edge of the
 * sidebar's heading: a search that filters the list to the sessions it
 * names, and a bell that switches the list to what is waiting on the reader.
 * Both are toggles rather than destinations: the list under them is the same
 * sidebar either way, and the screen beside it does not change.
 *
 * The bell wears the count of what is waiting, so the reader sees that
 * something needs them without switching to look; switched on it takes the
 * accent, the one colour in the heading, because it is the one state that
 * changes what the whole column below it means.
 */
export function SidebarHeaderControls(props: SidebarHeaderControlsProps) {
    const waiting = props.attentionCount ?? 0;
    return (
        <div
            className={["happy-sidebar-header-controls", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="sidebar-header-controls"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <button
                aria-label={props.searchOpen ? "Close search" : "Search sessions"}
                aria-pressed={props.searchOpen}
                className="happy-sidebar-header-controls__control"
                data-control="search"
                onClick={props.onSearchToggle}
                title={props.searchOpen ? "Close search" : "Search sessions"}
                type="button"
            >
                <Icon name="search" size={16} />
            </button>
            <button
                aria-label={
                    props.attentionOn
                        ? "Show every workspace"
                        : waiting > 0
                          ? `Show what needs you (${String(waiting)})`
                          : "Show what needs you"
                }
                aria-pressed={props.attentionOn}
                className="happy-sidebar-header-controls__control"
                data-control="attention"
                onClick={props.onAttentionToggle}
                title={props.attentionOn ? "Show every workspace" : "Show what needs you"}
                type="button"
            >
                <Icon name="bell" size={16} />
                {waiting > 0 ? (
                    <span
                        className="happy-sidebar-header-controls__count"
                        data-happy-desktop-ui="sidebar-header-controls-count"
                    >
                        {waiting > 99 ? "99+" : String(waiting)}
                    </span>
                ) : null}
            </button>
        </div>
    );
}
