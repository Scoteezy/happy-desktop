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
 * agent. The daemon validates every write; the window validates again before it
 * draws anything, because the document is Prioritizing's to write and a window
 * must never render what it was not promised. It is parsed inertly as XML into
 * a typed tree, every edit the window makes is made on that tree, and the tree
 * is written back whole.
 */

const ROOT = "nav";
const SEARCH = "happy-search";
const CREATE = "happy-create";
const SECTION = "happy-section";
const SEPARATOR = "happy-separator";
const SPACE = "happy-space";
/** How deep sessions may nest under a space, as the daemon allows. */
const DEPTH_MAX = 16;

const FOLD_RIBBON = "fold-ribbon";

const ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
    [ROOT]: [FOLD_RIBBON],
    [SEARCH]: [],
    [CREATE]: [],
    [SECTION]: ["id", "label", "collapsed"],
    [SEPARATOR]: ["id"],
    [SPACE]: ["id", "expanded", FOLD_RIBBON],
};

/**
 * Where a foldable row's fold control stands: shown only while the row is
 * hovered or focused, over what the row reports at its edge, or always, as the
 * row's last column with the change count left of it.
 */
export type SidebarDocumentFoldRibbon = "hover" | "always";

function foldRibbonOf(element: Element): SidebarDocumentFoldRibbon | undefined {
    const value = element.getAttribute(FOLD_RIBBON);
    if (value === null) return undefined;
    if (value !== "hover" && value !== "always")
        throw new SidebarDocumentInvalid(`${FOLD_RIBBON} must be "hover" or "always".`);
    return value;
}

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
            return `${node.kind}:${node.id}`;
    }
}

const ID = /^[^\s\p{Cc}]{1,128}$/u;

function flag(element: Element, name: string): boolean {
    const value = element.getAttribute(name);
    if (value === null || value === "false") return false;
    if (value !== "true") throw new SidebarDocumentInvalid(`${name} must be "true" or "false".`);
    return true;
}

function attributesCheck(element: Element): void {
    const allowed = ATTRIBUTES[element.tagName];
    if (allowed === undefined || element.namespaceURI !== null)
        throw new SidebarDocumentInvalid(`<${element.tagName}> is not allowed.`);
    for (const attribute of element.getAttributeNames())
        if (!allowed.includes(attribute))
            throw new SidebarDocumentInvalid(`<${element.tagName}> may not carry ${attribute}.`);
}

function textCheck(element: Element): void {
    for (const node of element.childNodes)
        if (node.nodeType !== 1 && (node.nodeType !== 3 || /\S/u.test(node.textContent ?? "")))
            throw new SidebarDocumentInvalid("The sidebar holds elements only.");
}

function idOf(element: Element, prefix: string, seen: Set<string>): string {
    const id = element.getAttribute("id");
    if (!id || !ID.test(id)) throw new SidebarDocumentInvalid(`<${element.tagName}> needs an id.`);
    if (seen.has(`${prefix}:${id}`)) throw new SidebarDocumentInvalid(`${id} appears twice.`);
    seen.add(`${prefix}:${id}`);
    return id;
}

function sessionsOf(element: Element, seen: Set<string>, depth: number): SidebarDocumentSession[] {
    textCheck(element);
    if (element.children.length > 0 && depth > DEPTH_MAX)
        throw new SidebarDocumentInvalid("Sessions nest too deep.");
    return [...element.children].map((child) => {
        attributesCheck(child);
        if (child.tagName !== SPACE)
            throw new SidebarDocumentInvalid(`Only <${SPACE}> may nest under a row.`);
        const foldRibbon = foldRibbonOf(child);
        return {
            kind: "session",
            id: idOf(child, "session", seen),
            expanded: flag(child, "expanded"),
            ...(foldRibbon ? { foldRibbon } : {}),
            children: sessionsOf(child, seen, depth + 1),
        };
    });
}

/** Parses and validates; throws `SidebarDocumentInvalid` for anything the window will not draw. */
export function sidebarDocumentView(html: string): SidebarDocumentView {
    const document = new DOMParser().parseFromString(html, "application/xml");
    if (document.getElementsByTagName("parsererror").length > 0)
        throw new SidebarDocumentInvalid("The sidebar is not well-formed XML.");
    const root = document.documentElement;
    if (root.tagName !== ROOT)
        throw new SidebarDocumentInvalid(`The sidebar must be one <${ROOT}>.`);
    attributesCheck(root);
    textCheck(root);
    const seen = new Set<string>();
    const items = [...root.children].map((element): SidebarDocumentItem => {
        attributesCheck(element);
        switch (element.tagName) {
            case SEARCH:
            case CREATE: {
                const kind = element.tagName === SEARCH ? "search" : "create";
                if (element.childNodes.length > 0 || seen.has(kind))
                    throw new SidebarDocumentInvalid(`<${element.tagName}> appears once, empty.`);
                seen.add(kind);
                return { kind };
            }
            case SECTION: {
                if (element.childNodes.length > 0)
                    throw new SidebarDocumentInvalid(`<${SECTION}> holds nothing.`);
                const label = element.getAttribute("label") ?? "";
                if (label.length === 0 || label.length > 256)
                    throw new SidebarDocumentInvalid(
                        `<${SECTION}> needs a label of 1–256 characters.`,
                    );
                return {
                    kind: "section",
                    id: idOf(element, "section", seen),
                    label,
                    collapsed: flag(element, "collapsed"),
                };
            }
            case SEPARATOR: {
                if (element.childNodes.length > 0)
                    throw new SidebarDocumentInvalid(`<${SEPARATOR}> holds nothing.`);
                return { kind: "separator", id: idOf(element, "separator", seen) };
            }
            case SPACE: {
                const foldRibbon = foldRibbonOf(element);
                return {
                    kind: "space",
                    id: idOf(element, "space", seen),
                    expanded: flag(element, "expanded"),
                    ...(foldRibbon ? { foldRibbon } : {}),
                    children: sessionsOf(element, seen, 1),
                };
            }
            default:
                throw new SidebarDocumentInvalid(`<${element.tagName}> may not stand at the top.`);
        }
    });
    if (!seen.has("search") || !seen.has("create"))
        throw new SidebarDocumentInvalid(`<${SEARCH}/> and <${CREATE}/> each appear once.`);
    const foldRibbon = foldRibbonOf(root);
    return { ...(foldRibbon ? { foldRibbon } : {}), items };
}

function attribute(name: string, value: string): string {
    const escaped = value
        .replace(/&/gu, "&amp;")
        .replace(/</gu, "&lt;")
        .replace(/>/gu, "&gt;")
        .replace(/"/gu, "&quot;");
    return ` ${name}="${escaped}"`;
}

function nodeWrite(node: SidebarDocumentNode, indent: string): string {
    switch (node.kind) {
        case "search":
            return `${indent}<${SEARCH}/>\n`;
        case "create":
            return `${indent}<${CREATE}/>\n`;
        case "section":
            return `${indent}<${SECTION}${attribute("id", node.id)}${attribute("label", node.label)}${
                node.collapsed ? attribute("collapsed", "true") : ""
            }/>\n`;
        case "separator":
            return `${indent}<${SEPARATOR}${attribute("id", node.id)}/>\n`;
        case "space":
        case "session": {
            const open = `${indent}<${SPACE}${attribute("id", node.id)}${
                node.expanded ? attribute("expanded", "true") : ""
            }${node.foldRibbon ? attribute(FOLD_RIBBON, node.foldRibbon) : ""}`;
            if (node.children.length === 0) return `${open}/>\n`;
            return `${open}>\n${node.children
                .map((child) => nodeWrite(child, `${indent}  `))
                .join("")}${indent}</${SPACE}>\n`;
        }
    }
}

/** The document as the daemon reads it, one node a line. */
export function sidebarDocumentWrite(view: SidebarDocumentView): string {
    const open = view.foldRibbon
        ? `<${ROOT}${attribute(FOLD_RIBBON, view.foldRibbon)}>`
        : `<${ROOT}>`;
    return `${open}\n${view.items.map((item) => nodeWrite(item, "  ")).join("")}</${ROOT}>\n`;
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
