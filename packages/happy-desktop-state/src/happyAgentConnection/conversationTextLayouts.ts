import { parseMediaLayoutHtml, splitMediaLayoutBlocks } from "@slopus/happy-agent-client";
import type { ConversationMediaLayoutNode } from "../conversation/conversationEntry.js";
import { mediaLayoutProject } from "./mediaLayoutProject.js";

/**
 * One stretch of an agent's reply: Markdown, or an HTML block that may lay
 * out pictures. Joined, the stretches are the reply's text exactly.
 *
 * A `layout` is a block that holds an `<img>`; `complete` is false for the
 * block still open at the end of the text, which may close as more arrives.
 */
export type ConversationTextSegment =
    | { readonly type: "markdown"; readonly text: string }
    | { readonly type: "layout"; readonly html: string; readonly complete: boolean };

/** A reply's text cut into Markdown and the HTML blocks that may lay out pictures. */
export function conversationTextSegments(text: string): readonly ConversationTextSegment[] {
    return splitMediaLayoutBlocks(text);
}

/** A block's layout over the pictures it placed. */
export type ConversationTextLayout = {
    readonly root: readonly ConversationMediaLayoutNode[];
    /**
     * The positions `resolve` returned that the layout places, in document
     * order; item node `n` shows the picture at `placed[n]`.
     */
    readonly placed: readonly number[];
};

/**
 * The layout one HTML block draws, with each `<img src>` resolved by `resolve`
 * to a position in the caller's own list of pictures; a source it does not
 * resolve is left out. Nothing, when no picture resolves or the block is past
 * the parser's limits: the block is then the inert HTML it was written as, so
 * nothing the agent wrote is cut short.
 *
 * The tree is checked again exactly as a presented layout is, so it carries
 * only the closed node set and grammar-checked styles `MediaTree` draws.
 */
export function conversationTextLayoutParse(
    html: string,
    resolve: (src: string) => number | undefined,
): ConversationTextLayout | undefined {
    const parsed = parseMediaLayoutHtml(html, resolve);
    if (parsed.truncated || parsed.placed.length === 0) return undefined;
    const positions = new Map(parsed.placed.map((index, position) => [index, position]));
    const layout = mediaLayoutProject(
        { type: "tree", root: parsed.root },
        parsed.placed.length,
        (index) => positions.get(index),
    );
    return layout?.type === "tree" ? { root: layout.root, placed: parsed.placed } : undefined;
}
