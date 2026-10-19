/** Ported from https://github.com/Boring-Software-Inc/dither-kit at
 * 1e7faee9aa252e499651e6736ed65f7a07d9a6bd. MIT per its package.json.
 * palette.ts named colors now resolve exclusively through Happy theme roles. */
import type { DitherColor } from "./ditherTypes";
const TOKENS: Readonly<Record<DitherColor, string>> = {
    blue: "--text-link",
    green: "--status-connected",
    orange: "--box-warning-text",
    red: "--text-destructive",
    grey: "--text-secondary",
};
export function ditherPalette(root: HTMLElement): Readonly<Record<DitherColor, string>> {
    const style = getComputedStyle(root);
    return {
        blue: style.getPropertyValue(TOKENS.blue).trim(),
        green: style.getPropertyValue(TOKENS.green).trim(),
        orange: style.getPropertyValue(TOKENS.orange).trim(),
        red: style.getPropertyValue(TOKENS.red).trim(),
        grey: style.getPropertyValue(TOKENS.grey).trim(),
    };
}
