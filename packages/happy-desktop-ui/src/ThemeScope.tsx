import { type CSSProperties, type ReactNode } from "react";
import type { CustomTheme, ThemeColorRole, ThemeMode } from "happy-desktop-state";

export type { ThemeMode };
export type ScrollbarVisibility = "always" | "automatic";

export type ThemeScopeProps = {
    children: ReactNode;
    mode: ThemeMode;
    /** The hand-made theme `custom` renders; an untouched midnight when absent. */
    customTheme?: CustomTheme;
    scrollbarVisibility?: ScrollbarVisibility;
};

/**
 * Applies one user-selected appearance to a stable product subtree while
 * retaining the system palette when no explicit override is selected. The
 * custom theme is its base palette's class with the replaced roles declared on
 * the same element, so every descendant inherits them as it would the base.
 */
export function ThemeScope(props: ThemeScopeProps) {
    const palette = props.mode === "custom" ? (props.customTheme?.base ?? "midnight") : props.mode;
    const colors = props.mode === "custom" ? props.customTheme?.colors : undefined;
    return (
        <div
            className={
                palette === "system"
                    ? "happy-theme-scope"
                    : `happy-theme-scope happy-theme-${palette}`
            }
            data-happy-desktop-ui="theme-scope"
            data-scrollbar-visibility={props.scrollbarVisibility ?? "automatic"}
            style={colors ? themeColorsStyle(colors) : undefined}
        >
            {props.children}
        </div>
    );
}

function themeColorsStyle(colors: CustomTheme["colors"]): CSSProperties {
    const style: Record<string, string> = {};
    for (const [role, value] of Object.entries(colors) as [ThemeColorRole, string][])
        style[`--${role}`] = value;
    return style;
}
