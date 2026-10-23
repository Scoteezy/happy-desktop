import { mediaLayoutStyleValue, type MediaLayoutStyleKey } from "@slopus/happy-agent-client";
import {
    CONVERSATION_MEDIA_LAYOUT_CSS_PROPERTIES,
    type ConversationMediaLayout,
    type ConversationMediaLayoutCssProperty,
    type ConversationMediaLayoutNode,
    type ConversationMediaLayoutStyle,
    type ConversationMediaLayoutTag,
} from "../conversation/conversationEntry.js";

/* The properties drawn here are the protocol's, less its two theme roles: a
   property the protocol renames or drops fails this line at compile time. */
CONVERSATION_MEDIA_LAYOUT_CSS_PROPERTIES satisfies readonly MediaLayoutStyleKey[];
type CssPropertiesCovered =
    Exclude<MediaLayoutStyleKey, "fontSize" | "tone"> extends ConversationMediaLayoutCssProperty
        ? true
        : never;
const cssPropertiesCovered: CssPropertiesCovered = true;
void cssPropertiesCovered;

/**
 * A media presentation's `layout` as this build can draw it.
 *
 * The protocol's objects are open: a newer daemon may add a style property,
 * a node type, a layout type, or a column count this build has never heard
 * of. Each is checked against the closed set this build draws and anything
 * else is left out — an unknown style property is ignored, a style value is
 * re-checked against the protocol's grammar and dropped if it fails, an
 * unknown node is skipped, and an unknown layout falls back to the automatic
 * one (`undefined`).
 *
 * A tree is also made total over the call's items: an index out of range or
 * named a second time is skipped, and every item the tree never named is
 * appended after it, so each item is drawn exactly once. `renumber` maps an
 * item node's index on the wire to the item it shows, before that check.
 */
export function mediaLayoutProject(
    value: unknown,
    itemCount: number,
    renumber: (index: number) => number | undefined = (index) => index,
): ConversationMediaLayout | undefined {
    if (!isRecord(value)) return undefined;
    if (value.type === "columns")
        return value.columns === 1 || value.columns === 2
            ? { type: "columns", columns: value.columns }
            : undefined;
    if (value.type !== "tree" || !Array.isArray(value.root)) return undefined;
    const seen = new Set<number>();
    const root = nodesProject(value.root, { itemCount, renumber, seen }, 0);
    for (let index = 0; index < itemCount; index += 1)
        if (!seen.has(index)) root.push({ type: "item", index });
    return root.length === 0 ? undefined : { type: "tree", root };
}

/**
 * An image item's density as this build draws it: pixels per point, over 1
 * and at most 4. Anything else is drawn at 1×, which only ever draws a
 * picture smaller than a stated density would.
 */
export function mediaScaleProject(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) && value > 1 && value <= 4
        ? value
        : undefined;
}

/** Deeper than the daemon ever sends (it stops at 12); a guard, not a limit. */
const MAX_DEPTH = 32;

const TAGS: ReadonlySet<string> = new Set<ConversationMediaLayoutTag>([
    "div",
    "section",
    "figure",
    "figcaption",
    "p",
    "span",
    "strong",
    "em",
    "code",
]);

type ItemsProject = {
    readonly itemCount: number;
    readonly renumber: (index: number) => number | undefined;
    readonly seen: Set<number>;
};

function nodesProject(
    values: readonly unknown[],
    items: ItemsProject,
    depth: number,
): ConversationMediaLayoutNode[] {
    const nodes: ConversationMediaLayoutNode[] = [];
    for (const value of values) {
        const node = nodeProject(value, items, depth);
        if (node) nodes.push(node);
    }
    return nodes;
}

function nodeProject(
    value: unknown,
    items: ItemsProject,
    depth: number,
): ConversationMediaLayoutNode | undefined {
    if (!isRecord(value)) return undefined;
    switch (value.type) {
        case "break":
            return { type: "break" };
        case "text":
            return typeof value.text === "string" && value.text.length > 0
                ? { type: "text", text: value.text }
                : undefined;
        case "item": {
            if (typeof value.index !== "number" || !Number.isInteger(value.index)) return undefined;
            const index = items.renumber(value.index);
            if (index === undefined || index < 0 || index >= items.itemCount) return undefined;
            if (items.seen.has(index)) return undefined;
            items.seen.add(index);
            const style = styleProject(value.style);
            return {
                type: "item",
                index,
                ...(typeof value.alt === "string" && value.alt.length > 0
                    ? { alt: value.alt }
                    : {}),
                ...(style ? { style } : {}),
            };
        }
        case "element": {
            if (depth >= MAX_DEPTH || typeof value.tag !== "string") return undefined;
            /* A tag this build does not know still holds its content: it is
               drawn as a plain block rather than dropping what is inside. */
            const tag = TAGS.has(value.tag) ? (value.tag as ConversationMediaLayoutTag) : "div";
            const style = styleProject(value.style);
            return {
                type: "element",
                tag,
                ...(style ? { style } : {}),
                children: Array.isArray(value.children)
                    ? nodesProject(value.children, items, depth + 1)
                    : [],
            };
        }
        default:
            return undefined;
    }
}

/**
 * A node's style, each value checked again against the protocol's own
 * per-property grammar and kept only as the normalized text it returns. A key
 * this build does not draw is ignored and a value the grammar refuses is
 * dropped, field by field; the rest of the node still draws.
 */
function styleProject(value: unknown): ConversationMediaLayoutStyle | undefined {
    if (!isRecord(value)) return undefined;
    const style: {
        -readonly [Key in keyof ConversationMediaLayoutStyle]: ConversationMediaLayoutStyle[Key];
    } = {};
    for (const property of CONVERSATION_MEDIA_LAYOUT_CSS_PROPERTIES) {
        const raw = value[property];
        if (typeof raw !== "string") continue;
        const checked = mediaLayoutStyleValue(property, raw);
        if (checked !== undefined) style[property] = checked;
    }
    const fontSize = oneOf(value.fontSize, ["small", "normal", "large", "title"] as const);
    if (fontSize) style.fontSize = fontSize;
    const tone = oneOf(value.tone, ["default", "muted", "accent"] as const);
    if (tone) style.tone = tone;
    return Object.keys(style).length === 0 ? undefined : style;
}

function oneOf<const Value extends string>(
    value: unknown,
    values: readonly Value[],
): Value | undefined {
    return typeof value === "string" && (values as readonly string[]).includes(value)
        ? (value as Value)
        : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
