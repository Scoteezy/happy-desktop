import { Icon, type IconName } from "./Icon";
export type BadgeVariant =
    | "neutral"
    | "accent"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "outline";
export type BadgeProps = {
    className?: string;
    icon?: IconName;
    label: string;
    variant?: BadgeVariant;
};
/** Status pill: NEEDS REVIEW, AGENT, IN PROGRESS… 18px mono uppercase. */
export function Badge(props: BadgeProps) {
    return (
        <span
            className={["happy-badge", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="badge"
            data-variant={props.variant ?? "neutral"}
        >
            {props.icon
                ? ((name) => (
                      <span className="happy-badge__icon" data-happy-desktop-ui="badge-icon">
                          <Icon name={name} size={12} />
                      </span>
                  ))(props.icon)
                : null}
            <span className="happy-badge__label" data-happy-desktop-ui="badge-label">
                {props.label}
            </span>
        </span>
    );
}
export type CountBadgeProps = {
    className?: string;
    count: number;
    tone?: "accent" | "neutral";
};
/** Unread-count pill: 18px round with mono lining/tabular figures. */
export function CountBadge(props: CountBadgeProps) {
    /* Stepped integral width (18/25/32…) instead of the intrinsic text width:
     * digit advances are fractional, and a fractional-width pill lands
     * right-aligned boxes off the device-pixel grid, visibly shifting the
     * rasterized digits. */
    const width = () => 18 + (String(props.count).length - 1) * 7;
    return (
        <span
            className={["happy-count-badge", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="count-badge"
            data-tone={props.tone ?? "accent"}
            style={{ width: `${width()}px` }}
        >
            <span className="happy-count-badge__label" data-happy-desktop-ui="count-badge-label">
                {props.count}
            </span>
        </span>
    );
}
export type ReactionChipProps = {
    active?: boolean;
    className?: string;
    count: number;
    emoji: string;
    onSelect?: () => void;
};
/** Emoji reaction pill under a message: 24px, toggles an accent active state. */
export function ReactionChip(props: ReactionChipProps) {
    return (
        <button
            aria-label={`${props.emoji} ${props.count}`}
            aria-pressed={props.active ? "true" : "false"}
            className={["happy-reaction-chip", props.className].filter(Boolean).join(" ")}
            data-active={props.active ? "" : undefined}
            data-happy-desktop-ui="reaction-chip"
            onClick={() => props.onSelect?.()}
            type="button"
        >
            <span
                className="happy-reaction-chip__emoji"
                data-happy-desktop-ui="reaction-chip-emoji"
            >
                <span
                    className="happy-reaction-chip__emoji-glyph"
                    data-happy-desktop-ui="reaction-chip-emoji-glyph"
                >
                    {props.emoji}
                </span>
            </span>
            <span
                className="happy-reaction-chip__count"
                data-happy-desktop-ui="reaction-chip-count"
            >
                {props.count}
            </span>
        </button>
    );
}
export type KeyCapProps = {
    className?: string;
    /** Removes the cap from the accessibility tree when its owner announces the shortcut. */
    decorative?: boolean;
    keys: string;
};
/** The modifier keys macOS names with a symbol, drawn from the system font that has them. */
const shortcutSymbols = new Set(["⌘", "⇧", "⌥", "⌃"]);
/** Keyboard shortcut hint, e.g. ⌘K in the title-bar search field. */
export function KeyCap(props: KeyCapProps) {
    return (
        <kbd
            aria-hidden={props.decorative ? "true" : undefined}
            aria-label={props.decorative ? undefined : props.keys}
            className={["happy-key-cap", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="key-cap"
        >
            <span className="happy-key-cap__label" data-happy-desktop-ui="key-cap-label">
                {Array.from(props.keys).map((key, index) => (
                    <span
                        className="happy-key-cap__key"
                        data-kind={shortcutSymbols.has(key) ? "symbol" : "text"}
                        key={`${key}-${index}`}
                        data-happy-desktop-ui="key-cap-key"
                    >
                        <span
                            className={
                                shortcutSymbols.has(key)
                                    ? "happy-key-cap__symbol"
                                    : "happy-key-cap__text"
                            }
                            data-happy-desktop-ui={
                                shortcutSymbols.has(key) ? "key-cap-symbol" : "key-cap-text"
                            }
                        >
                            {key}
                        </span>
                    </span>
                ))}
            </span>
        </kbd>
    );
}
