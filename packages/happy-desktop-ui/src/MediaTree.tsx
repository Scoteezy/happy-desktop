import { createElement, Fragment, type CSSProperties, type ReactNode } from "react";
import type {
    ConversationMediaKind,
    ConversationMediaLayoutLength,
    ConversationMediaLayoutNode,
    ConversationMediaLayoutStyle,
} from "happy-desktop-state";
import { messageTextLayoutFontGenerationGet } from "./messageTextLayout";

/**
 * C-304 MediaTree — a layout an agent wrote for the files it presented, drawn
 * as React elements.
 *
 * The tree arrives as closed typed nodes: a handful of tags, text, line
 * breaks, the call's items by index, and a style object whose every field is a
 * literal set or a bounded number. Each field maps to exactly one CSS
 * property here, a tone to a theme colour role and a font size to one of four
 * type steps; there is no CSS text and no HTML anywhere on the path. The
 * whole tree sits in a contained box (`.happy-media-tree`) that cannot paint
 * outside itself or grow past the transcript's width and a fixed height.
 *
 * Its height is the one in the transcript that cannot be computed: it is
 * text, flexbox, and grid written by a model. `mediaTreeHeight` lays the same
 * nodes out off-screen at the row's exact width, once per width and font
 * generation, so the row model reserves exactly what is painted.
 */

/** What an item node needs to know about the item it shows. */
export type MediaTreeItem = {
    readonly kind: ConversationMediaKind;
    readonly width?: number;
    readonly height?: number;
};

/** How one item node is drawn: its box style, and what the reader is told it is. */
export type MediaTreeItemRender = {
    readonly index: number;
    readonly className: string;
    readonly style: CSSProperties;
    readonly fit: "contain" | "cover";
    readonly alt?: string;
};

export type MediaTreeProps = {
    className?: string;
    "data-testid"?: string;
    root: readonly ConversationMediaLayoutNode[];
    items: readonly MediaTreeItem[];
    renderItem: (item: MediaTreeItemRender) => ReactNode;
};

/** `.happy-media-tree`'s max-height: a layout taller than this is clipped at it. */
export const MEDIA_TREE_MAX_HEIGHT = 1200;
/** A document or file in a tree is one `ResultCard`. */
const MEDIA_TREE_CARD_HEIGHT = 64;
/** A recording whose producer stated no frame takes 16:9. */
const MEDIA_TREE_VIDEO_RATIO = 16 / 9;

export function MediaTree(props: MediaTreeProps) {
    const render = (nodes: readonly ConversationMediaLayoutNode[]): ReactNode =>
        nodes.map((node, position) => {
            switch (node.type) {
                case "text":
                    return <Fragment key={position}>{node.text}</Fragment>;
                case "break":
                    return <br key={position} />;
                case "item": {
                    const item = props.items[node.index];
                    if (!item) return null;
                    return (
                        <Fragment key={position}>
                            {props.renderItem({
                                index: node.index,
                                className: mediaTreeItemClass(item),
                                style: mediaTreeItemStyle(item, node.style),
                                fit: node.style?.objectFit ?? "contain",
                                ...(node.alt === undefined ? {} : { alt: node.alt }),
                            })}
                        </Fragment>
                    );
                }
                case "element":
                    return createElement(
                        node.tag,
                        {
                            key: position,
                            style: mediaTreeElementStyle(node.style),
                            ...mediaTreeAttributes(node.style),
                        },
                        render(node.children),
                    );
            }
        });
    return (
        <div
            className={["happy-media-tree", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="media-tree"
            data-testid={props["data-testid"]}
        >
            {render(props.root)}
        </div>
    );
}

function length(value: ConversationMediaLayoutLength): string {
    return `${String(value.value)}${value.unit}`;
}

function box(value: { top: number; right: number; bottom: number; left: number }): string {
    return `${String(value.top)}px ${String(value.right)}px ${String(value.bottom)}px ${String(value.left)}px`;
}

/** Box alignment as flexbox and grid both read it. */
function alignment<Value extends string>(value: Value): string {
    return value === "start" ? "flex-start" : value === "end" ? "flex-end" : value;
}

/**
 * The inline style of one node: every typed field the layout set, each as
 * the one CSS property it names. Values are strings with their units, so the
 * same object styles a React element and an off-screen measuring node.
 */
export function mediaTreeElementStyle(
    style: ConversationMediaLayoutStyle | undefined,
): CSSProperties {
    if (!style) return {};
    const css: Record<string, string> = {};
    if (style.display) css.display = style.display;
    if (style.flexDirection) css.flexDirection = style.flexDirection;
    if (style.flexWrap) css.flexWrap = style.flexWrap;
    if (style.flexGrow !== undefined) css.flexGrow = String(style.flexGrow);
    if (style.flexShrink !== undefined) css.flexShrink = String(style.flexShrink);
    if (style.flexBasis)
        css.flexBasis = style.flexBasis === "auto" ? "auto" : length(style.flexBasis);
    if (style.justifyContent) css.justifyContent = alignment(style.justifyContent);
    if (style.alignItems) css.alignItems = alignment(style.alignItems);
    if (style.alignSelf) css.alignSelf = alignment(style.alignSelf);
    if (style.rowGap !== undefined) css.rowGap = `${String(style.rowGap)}px`;
    if (style.columnGap !== undefined) css.columnGap = `${String(style.columnGap)}px`;
    /* Each track may shrink below its content, so a wide picture cannot
       push the grid past the transcript. */
    if (style.gridTemplateColumns)
        css.gridTemplateColumns = style.gridTemplateColumns
            .map((weight) => `minmax(0, ${String(weight)}fr)`)
            .join(" ");
    if (style.gridColumnSpan !== undefined)
        css.gridColumn = `span ${String(style.gridColumnSpan)} / span ${String(style.gridColumnSpan)}`;
    if (style.padding) css.padding = box(style.padding);
    if (style.margin) css.margin = box(style.margin);
    if (style.width) css.width = length(style.width);
    if (style.minWidth) css.minWidth = length(style.minWidth);
    if (style.maxWidth) css.maxWidth = length(style.maxWidth);
    if (style.aspectRatio !== undefined) css.aspectRatio = String(style.aspectRatio);
    if (style.textAlign) css.textAlign = style.textAlign;
    if (style.fontWeight) css.fontWeight = style.fontWeight === "bold" ? "700" : "400";
    if (style.fontStyle) css.fontStyle = style.fontStyle;
    return css as CSSProperties;
}

/** Tone and type step are theme roles, named by attribute and resolved in CSS. */
function mediaTreeAttributes(style: ConversationMediaLayoutStyle | undefined): {
    "data-font-size"?: string;
    "data-tone"?: string;
} {
    return {
        ...(style?.fontSize ? { "data-font-size": style.fontSize } : {}),
        ...(style?.tone ? { "data-tone": style.tone } : {}),
    };
}

function mediaTreeItemClass(item: MediaTreeItem): string {
    if (item.kind === "image") return "happy-media-image-tile happy-media-tree__item";
    if (item.kind === "video") return "happy-media-video-tile happy-media-tree__item";
    return "happy-media-tree__item happy-media-tree__card";
}

/**
 * An item's box: the layout's own style over the default, which is the full
 * width of its container at the item's own shape. A document or file is a
 * card of fixed height instead.
 */
function mediaTreeItemStyle(
    item: MediaTreeItem,
    style: ConversationMediaLayoutStyle | undefined,
): CSSProperties {
    const css = mediaTreeElementStyle(style);
    if (item.kind !== "image" && item.kind !== "video") return css;
    if (css.aspectRatio !== undefined) return css;
    const ratio =
        item.width && item.height
            ? item.width / item.height
            : item.kind === "video"
              ? MEDIA_TREE_VIDEO_RATIO
              : 4 / 3;
    return { ...css, aspectRatio: String(ratio) };
}

let measureHost: HTMLDivElement | undefined;
const measured = new WeakMap<readonly ConversationMediaLayoutNode[], Map<string, number>>();

/**
 * The painted height of `root` at `width`: the same nodes, classes, and
 * inline styles `MediaTree` renders, laid out in a hidden box at that exact
 * width. Items are their boxes alone — a tile's contents are absolutely
 * placed and add nothing — so no picture has to load. Remembered per tree,
 * width, items, and font generation; a webfont arriving re-measures.
 */
export function mediaTreeHeight(
    root: readonly ConversationMediaLayoutNode[],
    items: readonly MediaTreeItem[],
    width: number,
): number {
    if (typeof document === "undefined") return MEDIA_TREE_MAX_HEIGHT / 2;
    const key = `${String(width)}|${String(messageTextLayoutFontGenerationGet())}|${items
        .map((item) => `${item.kind}:${String(item.width)}x${String(item.height)}`)
        .join(",")}`;
    let byKey = measured.get(root);
    const known = byKey?.get(key);
    if (known !== undefined) return known;
    if (!measureHost?.isConnected) {
        measureHost = document.createElement("div");
        measureHost.setAttribute("aria-hidden", "true");
        measureHost.dataset.happyDesktopUi = "media-tree-measure";
        /* Absolute: the measuring box must sit outside every flow so laying
           out a tree in it moves nothing on screen. */
        measureHost.style.cssText =
            "position:absolute;top:0;left:-100000px;visibility:hidden;pointer-events:none;contain:layout paint;";
        document.body.append(measureHost);
    }
    measureHost.style.width = `${String(width)}px`;
    const tree = document.createElement("div");
    tree.className = "happy-media-tree";
    for (const node of root) tree.append(...domNodes(node, items));
    measureHost.replaceChildren(tree);
    const height = tree.getBoundingClientRect().height;
    measureHost.replaceChildren();
    if (!byKey) {
        byKey = new Map();
        measured.set(root, byKey);
    }
    byKey.set(key, height);
    return height;
}

function styleApply(element: HTMLElement, style: CSSProperties): void {
    for (const [property, value] of Object.entries(style))
        element.style.setProperty(
            property.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`),
            String(value),
        );
}

function domNodes(node: ConversationMediaLayoutNode, items: readonly MediaTreeItem[]): Node[] {
    switch (node.type) {
        case "text":
            return [document.createTextNode(node.text)];
        case "break":
            return [document.createElement("br")];
        case "item": {
            const item = items[node.index];
            if (!item) return [];
            const element = document.createElement("span");
            element.className = mediaTreeItemClass(item);
            styleApply(element, mediaTreeItemStyle(item, node.style));
            if (item.kind !== "image" && item.kind !== "video") {
                const card = document.createElement("span");
                card.style.cssText = `display:block;height:${String(MEDIA_TREE_CARD_HEIGHT)}px;`;
                element.append(card);
            }
            return [element];
        }
        case "element": {
            const element = document.createElement(node.tag);
            styleApply(element, mediaTreeElementStyle(node.style));
            for (const [name, value] of Object.entries(mediaTreeAttributes(node.style)))
                element.setAttribute(name, value);
            for (const child of node.children) element.append(...domNodes(child, items));
            return [element];
        }
    }
}
