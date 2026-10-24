import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { remarkFileReferences } from "./messageFileReferences";
import { messageMathTreeShape, remarkMessageMath } from "./messageMath";

/**
 * Rendering and geometry share one Markdown syntax contract. ReactMarkdown
 * owns the render transform, while this parser exposes the same remark/GFM AST
 * to the row-height model without mounting anything.
 *
 * File references are linked in the render pipeline only. A transform runs
 * after parsing and this parser never runs one, and the geometry model is
 * unaffected either way: linking a reference changes what its text points at
 * and not one character of the text itself.
 *
 * Math is different: lifting a display formula out of its paragraph changes
 * the blocks, so the parser applies that same shaping itself.
 */
export const MESSAGE_MARKDOWN_REMARK_PLUGINS = [
    remarkGfm,
    remarkMessageMath,
    remarkFileReferences,
    remarkEmptyListLines,
];

const messageMarkdownParser = unified().use(remarkParse).use(remarkGfm).use(remarkMessageMath);

export type MessageMarkdownAst = ReturnType<typeof messageMarkdownParser.parse>;

type MarkdownBlock = MessageMarkdownAst["children"][number];
type MarkdownListItem = Extract<MarkdownBlock, { type: "list" }>["children"][number];
type MarkdownPhrasing = Extract<MarkdownBlock, { type: "paragraph" }>["children"][number];

function phrasingEmpty(node: MarkdownPhrasing): boolean {
    if (node.type === "html") return true;
    if (node.type === "text") return /^[ \t\r\n\f]*$/.test(node.value);
    if (
        node.type === "emphasis" ||
        node.type === "strong" ||
        node.type === "delete" ||
        node.type === "link" ||
        node.type === "linkReference"
    )
        return node.children.every(phrasingEmpty);
    return false;
}

/** A list's empty text line, shared by the renderer and its height model.
 * Empty headings and blockquotes keep their own block geometry; a checkbox
 * already supplies visible content even if its paragraph has no text. */
export function messageMarkdownListItemNeedsEmptyLine(item: MarkdownListItem): boolean {
    if (typeof item.checked === "boolean") return false;
    const first = item.children.find(
        (node) =>
            node.type !== "html" &&
            node.type !== "definition" &&
            node.type !== "footnoteDefinition",
    );
    return (
        first === undefined || (first.type === "paragraph" && first.children.every(phrasingEmpty))
    );
}

function remarkEmptyListLines() {
    return (tree: MessageMarkdownAst) => {
        const walk = (nodes: readonly MarkdownBlock[]) => {
            for (const node of nodes) {
                if (node.type === "list") {
                    for (const item of node.children) {
                        if (messageMarkdownListItemNeedsEmptyLine(item)) {
                            const paragraph = item.children.find(
                                (child) => child.type === "paragraph",
                            );
                            // Tight paragraphs unwrap into the li; spread ones
                            // need the baseline inside their actual p element.
                            const target =
                                paragraph && (node.spread || item.spread) ? paragraph : item;
                            target.data = {
                                ...target.data,
                                hProperties: { className: ["happy-message__empty-list-line"] },
                            };
                        }
                        walk(item.children);
                    }
                } else if (node.type === "blockquote" || node.type === "footnoteDefinition") {
                    walk(node.children);
                }
            }
        };
        walk(tree.children);
    };
}

/** Parses one message exactly once per text-layout cache lifetime. */
export function messageMarkdownParse(source: string): MessageMarkdownAst {
    return messageMathTreeShape(messageMarkdownParser.parse(source));
}
