import type { CSSProperties } from "react";
import { TextField } from "./TextField";

export interface SidebarSearchFieldProps {
    readonly value: string;
    readonly onValueChange: (value: string) => void;
    /** Escape, or the field losing focus while empty, hands the row back. */
    readonly onClose: () => void;
    readonly placeholder?: string;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

/**
 * SidebarSearchField — the row that appears under the sidebar's heading when
 * search is on: one field, on the rows' inset, that takes the focus as it
 * arrives so the reader is already typing. Escape closes it; so does leaving
 * it with nothing typed, because an empty field left open is a row of chrome
 * saying nothing.
 */
export function SidebarSearchField(props: SidebarSearchFieldProps) {
    return (
        <div
            className={["happy-sidebar-search-field", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="sidebar-search-field"
            data-testid={props["data-testid"]}
            onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                props.onClose();
            }}
            style={props.style}
        >
            <TextField
                autoFocus
                fullWidth
                leadingIcon="search"
                onBlur={() => {
                    if (props.value.trim() === "") props.onClose();
                }}
                onValueChange={props.onValueChange}
                placeholder={props.placeholder ?? "Search sessions"}
                size="small"
                value={props.value}
            />
        </div>
    );
}
