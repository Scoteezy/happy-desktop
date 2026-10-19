export type SidebarSectionContextProps = { text: string };

/** Plain, non-interactive section context, capped at two wrapped text lines. */
export function SidebarSectionContext({ text }: SidebarSectionContextProps) {
    return (
        <span
            className="happy-sidebar__section-context"
            data-happy-desktop-ui="sidebar-section-context"
        >
            <span className="happy-sidebar__section-context-text">{text}</span>
        </span>
    );
}

export type SidebarSectionTailProps = {
    expanded: boolean;
    hiddenCount: number;
    sectionLabel: string;
    onToggle: () => void;
};

/** An explicit, controlled disclosure for the ordered tail of a flat section. */
export function SidebarSectionTail(props: SidebarSectionTailProps) {
    return (
        <button
            aria-expanded={props.expanded}
            aria-label={`${props.expanded ? "Show less in" : `Show ${props.hiddenCount} more in`} ${props.sectionLabel}`}
            className="happy-sidebar__section-tail"
            data-happy-desktop-ui="sidebar-section-tail"
            onClick={props.onToggle}
            type="button"
        >
            {props.expanded ? "show less" : `+${props.hiddenCount} more`}
        </button>
    );
}
