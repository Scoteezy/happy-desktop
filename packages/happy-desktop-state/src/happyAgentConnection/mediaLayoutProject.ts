import type {
    ConversationMediaLayout,
    ConversationMediaLayoutBox,
    ConversationMediaLayoutLength,
    ConversationMediaLayoutNode,
    ConversationMediaLayoutStyle,
    ConversationMediaLayoutTag,
} from "../conversation/conversationEntry.js";

/**
 * A media presentation's `layout` as this build can draw it.
 *
 * The protocol's objects are open: a newer daemon may add a style field, a
 * node type, a layout type, or a column count this build has never heard of.
 * Each is checked against the closed set this build draws and anything else
 * is left out — an unknown style field is ignored, an unknown node is skipped,
 * and an unknown layout falls back to the automatic one (`undefined`).
 *
 * A tree is also made total over the call's items: an index out of range or
 * named a second time is skipped, and every item the tree never named is
 * appended after it, so each item is drawn exactly once.
 */
export function mediaLayoutProject(
    value: unknown,
    itemCount: number,
): ConversationMediaLayout | undefined {
    if (!isRecord(value)) return undefined;
    if (value.type === "columns")
        return value.columns === 1 || value.columns === 2
            ? { type: "columns", columns: value.columns }
            : undefined;
    if (value.type !== "tree" || !Array.isArray(value.root)) return undefined;
    const seen = new Set<number>();
    const root = nodesProject(value.root, itemCount, seen, 0);
    for (let index = 0; index < itemCount; index += 1)
        if (!seen.has(index)) root.push({ type: "item", index });
    return root.length === 0 ? undefined : { type: "tree", root };
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

function nodesProject(
    values: readonly unknown[],
    itemCount: number,
    seen: Set<number>,
    depth: number,
): ConversationMediaLayoutNode[] {
    const nodes: ConversationMediaLayoutNode[] = [];
    for (const value of values) {
        const node = nodeProject(value, itemCount, seen, depth);
        if (node) nodes.push(node);
    }
    return nodes;
}

function nodeProject(
    value: unknown,
    itemCount: number,
    seen: Set<number>,
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
            const index = value.index;
            if (typeof index !== "number" || !Number.isInteger(index)) return undefined;
            if (index < 0 || index >= itemCount || seen.has(index)) return undefined;
            seen.add(index);
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
                    ? nodesProject(value.children, itemCount, seen, depth + 1)
                    : [],
            };
        }
        default:
            return undefined;
    }
}

function styleProject(value: unknown): ConversationMediaLayoutStyle | undefined {
    if (!isRecord(value)) return undefined;
    const style: {
        -readonly [Key in keyof ConversationMediaLayoutStyle]: ConversationMediaLayoutStyle[Key];
    } = {};
    style.display = oneOf(value.display, ["block", "flex", "grid"] as const);
    style.flexDirection = oneOf(value.flexDirection, [
        "row",
        "column",
        "row-reverse",
        "column-reverse",
    ] as const);
    style.flexWrap = oneOf(value.flexWrap, ["nowrap", "wrap"] as const);
    style.flexGrow = numberIn(value.flexGrow, 0, 12);
    style.flexShrink = numberIn(value.flexShrink, 0, 12);
    style.flexBasis = value.flexBasis === "auto" ? "auto" : lengthProject(value.flexBasis);
    style.justifyContent = oneOf(value.justifyContent, [
        "start",
        "center",
        "end",
        "space-between",
        "space-around",
        "space-evenly",
    ] as const);
    style.alignItems = oneOf(value.alignItems, [
        "start",
        "center",
        "end",
        "stretch",
        "baseline",
    ] as const);
    style.alignSelf = oneOf(value.alignSelf, [
        "auto",
        "start",
        "center",
        "end",
        "stretch",
        "baseline",
    ] as const);
    style.rowGap = spacingProject(value.rowGap);
    style.columnGap = spacingProject(value.columnGap);
    if (
        Array.isArray(value.gridTemplateColumns) &&
        value.gridTemplateColumns.length >= 1 &&
        value.gridTemplateColumns.length <= 6 &&
        value.gridTemplateColumns.every(
            (weight) => typeof weight === "number" && weight > 0 && weight <= 12,
        )
    )
        style.gridTemplateColumns = value.gridTemplateColumns as number[];
    const span = numberIn(value.gridColumnSpan, 1, 6);
    style.gridColumnSpan = span === undefined ? undefined : Math.round(span);
    style.padding = boxProject(value.padding);
    style.margin = boxProject(value.margin);
    style.width = lengthProject(value.width);
    style.minWidth = lengthProject(value.minWidth);
    style.maxWidth = lengthProject(value.maxWidth);
    style.aspectRatio = numberIn(value.aspectRatio, 0.1, 10);
    style.objectFit = oneOf(value.objectFit, ["contain", "cover"] as const);
    style.textAlign = oneOf(value.textAlign, ["left", "center", "right"] as const);
    style.fontWeight = oneOf(value.fontWeight, ["normal", "bold"] as const);
    style.fontStyle = oneOf(value.fontStyle, ["normal", "italic"] as const);
    style.fontSize = oneOf(value.fontSize, ["small", "normal", "large", "title"] as const);
    style.tone = oneOf(value.tone, ["default", "muted", "accent"] as const);
    /* Fields that did not check out are left off entirely, not carried as
       `undefined`, so equal styles compare equal field by field. */
    const entries = Object.entries(style).filter(([, field]) => field !== undefined);
    return entries.length === 0
        ? undefined
        : (Object.fromEntries(entries) as ConversationMediaLayoutStyle);
}

function lengthProject(value: unknown): ConversationMediaLayoutLength | undefined {
    if (!isRecord(value)) return undefined;
    if (value.unit === "%") {
        const percent = numberIn(value.value, 0, 100);
        return percent === undefined ? undefined : { unit: "%", value: percent };
    }
    if (value.unit === "px") {
        const pixels = numberIn(value.value, 0, 1600);
        return pixels === undefined ? undefined : { unit: "px", value: pixels };
    }
    return undefined;
}

function spacingProject(value: unknown): number | undefined {
    return numberIn(value, 0, 64);
}

function boxProject(value: unknown): ConversationMediaLayoutBox | undefined {
    if (!isRecord(value)) return undefined;
    const top = spacingProject(value.top);
    const right = spacingProject(value.right);
    const bottom = spacingProject(value.bottom);
    const left = spacingProject(value.left);
    if (top === undefined || right === undefined || bottom === undefined || left === undefined)
        return undefined;
    return { top, right, bottom, left };
}

function oneOf<const Value extends string>(
    value: unknown,
    values: readonly Value[],
): Value | undefined {
    return typeof value === "string" && (values as readonly string[]).includes(value)
        ? (value as Value)
        : undefined;
}

function numberIn(value: unknown, low: number, high: number): number | undefined {
    return typeof value === "number" && Number.isFinite(value) && value >= low && value <= high
        ? value
        : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
