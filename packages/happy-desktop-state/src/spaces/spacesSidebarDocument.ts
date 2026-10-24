/**
 * The person's sidebar document: one flat, ordered list of items in strict
 * XML, which is the sidebar's whole state. Search, Create, sections,
 * separators and spaces are all items, and any of them may stand anywhere in
 * the list. A section is a titled heading that can fold the rows after it; a
 * separator is only a rule between rows. A space holds the sessions
 * Prioritizing chose to show under it, nested the way their agents are.
 *
 *     <nav>
 *       <happy-search/>
 *       <happy-create/>
 *       <happy-space id="sHappy" expanded="true">
 *         <happy-space id="aPrioritizing"/>
 *       </happy-space>
 *       <happy-separator id="s1"/>
 *       <happy-section id="c2n4" label="Releases"/>
 *       <happy-space id="sAndroid"/>
 *     </nav>
 *
 * A top-level `happy-space` names a space; a nested one names a session by its
 * agent. A `happy-widget` is a row of markup Prioritizing wrote, drawn isolated.
 * The daemon validates every write; the window validates again before it draws
 * anything, because the document is Prioritizing's to write and a window must
 * never render what it was not promised. It is read with the one parser the
 * daemon and every client share, every edit the window makes is made on the
 * typed tree, and the tree is written back in the same canonical form.
 */

import {
    formatSpaceSidebar,
    parseSpaceSidebar,
    SpaceSidebarError,
    type SpaceSidebarDocument,
    type SpaceSidebarItem,
    type SpaceSidebarSpaceNode,
} from "@slopus/happy-agent-client";

/**
 * Where a foldable row's fold control stands: shown only while the row is
 * hovered or focused, over what the row reports at its edge, or always, as the
 * row's last column with the change count left of it.
 */
export type SidebarDocumentFoldRibbon = "hover" | "always";

/** A session shown under its parent's agent, by its agent ID. */
export interface SidebarDocumentSession {
    readonly kind: "session";
    readonly id: string;
    /** Draws the sessions nested under it, and the worktrees its agent made. */
    readonly expanded: boolean;
    /** This row's own fold placement, over the document's. */
    readonly foldRibbon?: SidebarDocumentFoldRibbon;
    readonly children: readonly SidebarDocumentSession[];
}

/** One top-level item of the sidebar. */
export type SidebarDocumentItem =
    | { readonly kind: "search" }
    | { readonly kind: "create" }
    | {
          readonly kind: "section";
          readonly id: string;
          /** The heading's title, never empty. */
          readonly label: string;
          /** Folds the run of items after it, up to the next section or separator. */
          readonly collapsed: boolean;
      }
    /** A rule between rows, and nothing else. */
    | { readonly kind: "separator"; readonly id: string }
    /** Markup Prioritizing wrote, drawn as one isolated row. */
    | { readonly kind: "widget"; readonly id: string; readonly html: string }
    | {
          readonly kind: "space";
          readonly id: string;
          /** Draws its sessions and the worktrees the window draws under it. */
          readonly expanded: boolean;
          /** This row's own fold placement, over the document's. */
          readonly foldRibbon?: SidebarDocumentFoldRibbon;
          readonly children: readonly SidebarDocumentSession[];
      };

export type SidebarDocumentNode = SidebarDocumentItem | SidebarDocumentSession;

/** The document read into what the sidebar draws, in its order. */
export interface SidebarDocumentView {
    /** Where every foldable row's fold stands unless the row says otherwise. */
    readonly foldRibbon?: SidebarDocumentFoldRibbon;
    readonly items: readonly SidebarDocumentItem[];
}

/** Why a document was not drawn. */
export class SidebarDocumentInvalid extends Error {}

/**
 * A node's identity across the whole document. Section, separator, space and
 * session IDs come from different namespaces, so each is prefixed with its kind.
 */
export function sidebarDocumentKey(node: SidebarDocumentNode): string {
    switch (node.kind) {
        case "search":
        case "create":
            return node.kind;
        case "section":
        case "separator":
        case "space":
        case "session":
        case "widget":
            return `${node.kind}:${node.id}`;
    }
}

function sessionOf(node: SpaceSidebarSpaceNode): SidebarDocumentSession {
    return {
        kind: "session",
        id: node.id,
        expanded: node.expanded,
        ...(node.foldRibbon ? { foldRibbon: node.foldRibbon } : {}),
        children: node.children.map(sessionOf),
    };
}

/** The shared grammar's tree read as what the window draws. */
export function sidebarDocumentViewOf(document: SpaceSidebarDocument): SidebarDocumentView {
    const items = document.items.map((item): SidebarDocumentItem => {
        switch (item.type) {
            case "search":
            case "create":
                return { kind: item.type };
            case "section":
                return {
                    kind: "section",
                    id: item.id,
                    label: item.label,
                    collapsed: item.collapsed,
                };
            case "separator":
                return { kind: "separator", id: item.id };
            case "widget":
                return { kind: "widget", id: item.id, html: item.html };
            case "space":
                return {
                    kind: "space",
                    id: item.id,
                    expanded: item.expanded,
                    ...(item.foldRibbon ? { foldRibbon: item.foldRibbon } : {}),
                    children: item.children.map(sessionOf),
                };
        }
    });
    if (
        !items.some((item) => item.kind === "search") ||
        !items.some((item) => item.kind === "create")
    )
        throw new SidebarDocumentInvalid("<happy-search/> and <happy-create/> each appear once.");
    return { ...(document.foldRibbon ? { foldRibbon: document.foldRibbon } : {}), items };
}

/** Parses and validates; throws `SidebarDocumentInvalid` for anything the window will not draw. */
export function sidebarDocumentView(html: string): SidebarDocumentView {
    let document: SpaceSidebarDocument;
    try {
        document = parseSpaceSidebar(html);
    } catch (error) {
        if (error instanceof SpaceSidebarError) throw new SidebarDocumentInvalid(error.message);
        throw error;
    }
    return sidebarDocumentViewOf(document);
}

function spaceNodeOf(node: SidebarDocumentSession): SpaceSidebarSpaceNode {
    return {
        type: "space",
        id: node.id,
        expanded: node.expanded,
        ...(node.foldRibbon ? { foldRibbon: node.foldRibbon } : {}),
        children: node.children.map(spaceNodeOf),
    };
}

/** What the window draws, as the shared grammar's tree. */
export function sidebarDocumentOf(view: SidebarDocumentView): SpaceSidebarDocument {
    return {
        ...(view.foldRibbon ? { foldRibbon: view.foldRibbon } : {}),
        items: view.items.map((item): SpaceSidebarItem => {
            switch (item.kind) {
                case "search":
                    return { type: "search", id: "happy-search" };
                case "create":
                    return { type: "create", id: "happy-create" };
                case "section":
                    return {
                        type: "section",
                        id: item.id,
                        label: item.label,
                        collapsed: item.collapsed,
                    };
                case "separator":
                    return { type: "separator", id: item.id };
                case "widget":
                    return { type: "widget", id: item.id, html: item.html };
                case "space":
                    return {
                        type: "space",
                        id: item.id,
                        expanded: item.expanded,
                        ...(item.foldRibbon ? { foldRibbon: item.foldRibbon } : {}),
                        children: item.children.map(spaceNodeOf),
                    };
            }
        }),
    };
}

/** The document as the daemon reads it, in the canonical form every writer shares. */
export function sidebarDocumentWrite(view: SidebarDocumentView): string {
    return formatSpaceSidebar(sidebarDocumentOf(view));
}

type Parent = Extract<SidebarDocumentNode, { readonly children: unknown }>;

/** The siblings a node stands among: the top level, or one node's sessions. */
function siblingsOf(
    items: readonly SidebarDocumentItem[],
    key: string,
): { readonly parent: string | null; readonly nodes: readonly SidebarDocumentNode[] } | undefined {
    if (items.some((item) => sidebarDocumentKey(item) === key))
        return { parent: null, nodes: items };
    const search = (
        parent: Parent,
    ): { parent: string; nodes: readonly SidebarDocumentNode[] } | undefined => {
        if (parent.children.some((child) => sidebarDocumentKey(child) === key))
            return { parent: sidebarDocumentKey(parent), nodes: parent.children };
        for (const child of parent.children) {
            const found = search(child);
            if (found) return found;
        }
        return undefined;
    };
    for (const item of items) {
        if (item.kind !== "space") continue;
        const found = search(item);
        if (found) return found;
    }
    return undefined;
}

/** Replaces the children of the node `parent`, or the top level when `null`. */
function childrenReplace(
    items: readonly SidebarDocumentItem[],
    parent: string | null,
    nodes: readonly SidebarDocumentNode[],
): readonly SidebarDocumentItem[] {
    if (parent === null) return nodes as readonly SidebarDocumentItem[];
    const sessions = nodes as readonly SidebarDocumentSession[];
    const replace = <Node extends SidebarDocumentNode>(node: Node): Node => {
        if (node.kind !== "space" && node.kind !== "session") return node;
        if (sidebarDocumentKey(node) === parent) return { ...node, children: sessions };
        return { ...node, children: node.children.map(replace) };
    };
    return items.map(replace);
}

/** Where a folded section's run stops: at the next section or separator. */
function runBreaks(node: SidebarDocumentNode): boolean {
    return node.kind === "section" || node.kind === "separator";
}

/** Where the rows after `index` stop belonging to it: at the next section or separator. */
function blockEnd(nodes: readonly SidebarDocumentNode[], index: number): number {
    let end = index + 1;
    while (end < nodes.length && !runBreaks(nodes[end]!)) end += 1;
    return end;
}

/** The node itself, with the run it folds away when it is a folded section. */
function runEnd(nodes: readonly SidebarDocumentNode[], index: number): number {
    const node = nodes[index];
    return node?.kind === "section" && node.collapsed ? blockEnd(nodes, index) : index + 1;
}

/**
 * Moves one node among its own siblings, after `afterKey` or first. An item
 * moves anywhere at the top; a session only among its parent's sessions.
 *
 * A section is a block: its heading and every row after it up to the next
 * section or separator, folded or not, move as one, and the block lands after
 * the whole block `afterKey` belongs to, so it never splits another section.
 * Any other node landing after a folded section lands after its run, so a move
 * never hides or reveals rows. `undefined` when the move names no such siblings.
 */
export function sidebarDocumentMove(
    view: SidebarDocumentView,
    key: string,
    afterKey: string | null,
): SidebarDocumentView | undefined {
    if (key === afterKey) return undefined;
    const siblings = siblingsOf(view.items, key);
    if (!siblings) return undefined;
    const from = siblings.nodes.findIndex((node) => sidebarDocumentKey(node) === key);
    const section = siblings.nodes[from]?.kind === "section";
    const moved = siblings.nodes.slice(
        from,
        section ? blockEnd(siblings.nodes, from) : runEnd(siblings.nodes, from),
    );
    const rest = [...siblings.nodes.slice(0, from), ...siblings.nodes.slice(from + moved.length)];
    let at = 0;
    if (afterKey !== null) {
        const after = rest.findIndex((node) => sidebarDocumentKey(node) === afterKey);
        if (after < 0) return undefined;
        at =
            section && rest[after]!.kind !== "separator"
                ? blockEnd(rest, after)
                : runEnd(rest, after);
    }
    const nodes = [...rest.slice(0, at), ...moved, ...rest.slice(at)];
    if (nodes.every((node, index) => node === siblings.nodes[index])) return undefined;
    return { ...view, items: childrenReplace(view.items, siblings.parent, nodes) };
}

/** Folds or unfolds a section's run, or a space's or session's nested rows. */
export function sidebarDocumentFold(
    view: SidebarDocumentView,
    key: string,
): SidebarDocumentView | undefined {
    const siblings = siblingsOf(view.items, key);
    if (!siblings) return undefined;
    const nodes = siblings.nodes.map((node): SidebarDocumentNode => {
        if (sidebarDocumentKey(node) !== key) return node;
        if (node.kind === "section") return { ...node, collapsed: !node.collapsed };
        if (node.kind === "space" || node.kind === "session")
            return { ...node, expanded: !node.expanded };
        return node;
    });
    return { ...view, items: childrenReplace(view.items, siblings.parent, nodes) };
}

/**
 * Names new work before the document read catches up, where the daemon puts
 * it: right after the named section or separator; otherwise right after
 * Happy's own top-level row (below all its nested sessions); otherwise — Happy
 * absent, nested, or folded away under a section — right after Create, and
 * first when the document has no Create. New work is never hidden.
 */
export function sidebarDocumentInsert(
    view: SidebarDocumentView,
    spaceId: string,
    sectionId: string | null,
    happySpaceId: string | null,
): SidebarDocumentView | undefined {
    if (view.items.some((item) => item.kind === "space" && item.id === spaceId)) return undefined;
    const after = (): number => {
        if (sectionId !== null)
            return view.items.findIndex(
                (item) =>
                    (item.kind === "section" || item.kind === "separator") && item.id === sectionId,
            );
        let folded = false;
        for (const [index, item] of view.items.entries()) {
            if (item.kind === "section") folded = item.collapsed;
            else if (item.kind === "separator") folded = false;
            else if (item.kind === "space" && item.id === happySpaceId && !folded) return index;
        }
        return view.items.findIndex((item) => item.kind === "create");
    };
    const at = after() + 1;
    const node: SidebarDocumentItem = { kind: "space", id: spaceId, expanded: false, children: [] };
    return { ...view, items: [...view.items.slice(0, at), node, ...view.items.slice(at)] };
}

/**
 * One edit of a document as text: parsed, changed, written back. `undefined`
 * when the document is not one the window draws or the edit changed nothing.
 */
export function sidebarDocumentEdit(
    html: string,
    change: (view: SidebarDocumentView) => SidebarDocumentView | undefined,
): string | undefined {
    let view: SidebarDocumentView;
    try {
        view = sidebarDocumentView(html);
    } catch {
        return undefined;
    }
    const next = change(view);
    return next === undefined ? undefined : sidebarDocumentWrite(next);
}

/**
 * What the reader had folded and hidden in the sidebar they kept before
 * Spaces, applied once to the daemon's mirror of it.
 */
export interface SidebarDocumentClassic {
    /** Spaces whose nested rows the reader had folded shut. */
    readonly foldedSpaceIds: ReadonlySet<string>;
    /** Sections standing for headings the reader had folded shut. */
    readonly foldedSectionIds: ReadonlySet<string>;
    /** Spaces the reader had hidden; absent from the document means hidden. */
    readonly hiddenSpaceIds: ReadonlySet<string>;
}

/** The daemon's mirror of the classic sidebar with the reader's own folds applied. */
export function sidebarDocumentClassicApply(
    view: SidebarDocumentView,
    classic: SidebarDocumentClassic,
): SidebarDocumentView {
    return {
        ...view,
        items: view.items.flatMap((item): SidebarDocumentItem[] => {
            if (item.kind === "section" && classic.foldedSectionIds.has(item.id))
                return [{ ...item, collapsed: true }];
            if (item.kind !== "space") return [item];
            if (classic.hiddenSpaceIds.has(item.id)) return [];
            return classic.foldedSpaceIds.has(item.id) ? [{ ...item, expanded: false }] : [item];
        }),
    };
}
