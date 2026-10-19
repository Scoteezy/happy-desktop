/**
 * The person's sidebar document: plain HTML in which `<happy-space>` stands for
 * a row and `<happy-section>` for a heading, nested the way the sidebar draws
 * them. The daemon validates every write; the window validates again before it
 * draws anything, because the document is the manager's to write and a window
 * must never render what it was not promised.
 *
 * Parsed inertly with DOMParser — no script in it can run, and none is allowed —
 * then read into rows and headings for the trusted Sidebar components. Edits
 * the window makes (a drag, a fold) are DOM operations on a parsed copy,
 * serialized back for the daemon.
 */

/** Plain HTML the manager may write between rows, with a class from the style contract. */
const PLAIN_TAGS = new Set(["div", "ul", "li", "p", "span", "strong", "em", "hr"]);
const ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
    nav: [],
    "happy-space": ["ref", "tree", "collapsed"],
    "happy-section": ["id", "label", "collapsed"],
};

export interface SidebarDocumentSpace {
    readonly kind: "space";
    readonly ref: string;
    /** The app draws the space's live subtasks and worktrees under it. */
    readonly tree: boolean;
    readonly collapsed: boolean;
}

/** Plain HTML between rows, already validated, as markup to draw as it is. */
export interface SidebarDocumentHtml {
    readonly kind: "html";
    readonly html: string;
}

export type SidebarDocumentEntry = SidebarDocumentSpace | SidebarDocumentHtml;

export interface SidebarDocumentSection {
    readonly id: string;
    readonly label: string;
    readonly collapsed: boolean;
    readonly entries: readonly SidebarDocumentEntry[];
}

/** The document read into what the sidebar draws, in its order. */
export interface SidebarDocumentView {
    /** What stands before the first section: Happy, and new work it has not placed. */
    readonly top: readonly SidebarDocumentEntry[];
    readonly sections: readonly SidebarDocumentSection[];
    /** What follows the last section. */
    readonly bottom: readonly SidebarDocumentEntry[];
}

/** Why a document was not drawn. */
export class SidebarDocumentInvalid extends Error {}

function navOf(document: Document): Element {
    const nav = document.body.firstElementChild;
    if (nav?.tagName.toLowerCase() !== "nav" || nav.nextElementSibling !== null)
        throw new SidebarDocumentInvalid("The sidebar must be one <nav>.");
    return nav;
}

function validate(element: Element, refs: Set<string>, depth: number): void {
    const tag = element.tagName.toLowerCase();
    const allowed = ATTRIBUTES[tag] ?? (PLAIN_TAGS.has(tag) ? ["class"] : undefined);
    if (allowed === undefined) throw new SidebarDocumentInvalid(`<${tag}> is not allowed.`);
    for (const attribute of element.getAttributeNames())
        if (!allowed.includes(attribute))
            throw new SidebarDocumentInvalid(`<${tag}> may not carry ${attribute}.`);
    if (tag === "nav" && depth > 0) throw new SidebarDocumentInvalid("<nav> may not nest.");
    if (tag === "happy-space") {
        const ref = element.getAttribute("ref");
        if (!ref) throw new SidebarDocumentInvalid("<happy-space> needs a ref.");
        if (refs.has(ref)) throw new SidebarDocumentInvalid(`${ref} appears twice.`);
        refs.add(ref);
        if (element.children.length > 0)
            throw new SidebarDocumentInvalid("A space never holds another element.");
    }
    if (tag === "happy-section") {
        if (!element.getAttribute("id") || !element.getAttribute("label"))
            throw new SidebarDocumentInvalid("<happy-section> needs an id and a label.");
        if (element.parentElement?.tagName.toLowerCase() !== "nav")
            throw new SidebarDocumentInvalid("Sections sit directly in the <nav>.");
    }
    for (const child of element.children) validate(child, refs, depth + 1);
}

/** Parses and validates; throws `SidebarDocumentInvalid` for anything the window will not draw. */
export function sidebarDocumentParse(html: string): Document {
    const document = new DOMParser().parseFromString(html, "text/html");
    if (document.head.children.length > 0)
        throw new SidebarDocumentInvalid("Only the <nav> may be written.");
    validate(navOf(document), new Set(), 0);
    return document;
}

function entriesOf(nodes: Iterable<Element>): SidebarDocumentEntry[] {
    const entries: SidebarDocumentEntry[] = [];
    for (const node of nodes) {
        if (node.tagName.toLowerCase() === "happy-space")
            entries.push({
                kind: "space",
                ref: node.getAttribute("ref")!,
                tree: node.hasAttribute("tree"),
                collapsed: node.hasAttribute("collapsed"),
            });
        else entries.push({ kind: "html", html: node.outerHTML });
    }
    return entries;
}

/** The document as rows and headings. */
export function sidebarDocumentView(html: string): SidebarDocumentView {
    const nav = navOf(sidebarDocumentParse(html));
    const children = [...nav.children];
    const first = children.findIndex((node) => node.tagName.toLowerCase() === "happy-section");
    let last = -1;
    children.forEach((node, index) => {
        if (node.tagName.toLowerCase() === "happy-section") last = index;
    });
    if (first < 0) return { top: entriesOf(children), sections: [], bottom: [] };
    const sections: SidebarDocumentSection[] = [];
    const loose: Element[] = [];
    for (const node of children.slice(first, last + 1)) {
        if (node.tagName.toLowerCase() !== "happy-section") {
            loose.push(node);
            continue;
        }
        sections.push({
            id: node.getAttribute("id")!,
            label: node.getAttribute("label")!,
            collapsed: node.hasAttribute("collapsed"),
            entries: entriesOf(node.children),
        });
    }
    return {
        top: entriesOf(children.slice(0, first)),
        sections,
        bottom: entriesOf([...loose, ...children.slice(last + 1)]),
    };
}

function spaceNode(nav: Element, ref: string): Element | undefined {
    return [...nav.querySelectorAll("happy-space")].find(
        (node) => node.getAttribute("ref") === ref,
    );
}

function sectionNode(nav: Element, id: string): Element | undefined {
    return [...nav.querySelectorAll(":scope > happy-section")].find(
        (node) => node.getAttribute("id") === id,
    );
}

/** Takes a node out along with the line break before it, so the document stays one node a line. */
function detach(node: Element): void {
    const before = node.previousSibling;
    if (before?.nodeType === 3 && /^\s*$/.test(before.textContent ?? "")) before.remove();
    node.remove();
}

/** Puts a node after `after`, or first in `parent`, on a line of its own. */
function attach(parent: Element, node: Element, after: Element | null): void {
    const anchor = after ? after.nextSibling : parent.firstChild;
    parent.insertBefore(node, anchor);
    parent.insertBefore(node.ownerDocument.createTextNode("\n"), node);
    if (parent.lastChild === node) parent.appendChild(node.ownerDocument.createTextNode("\n"));
}

function edit(html: string, change: (nav: Element) => boolean): string | undefined {
    const document = sidebarDocumentParse(html);
    const nav = navOf(document);
    if (!change(nav)) return undefined;
    // The flags are written bare, as the manager reads and writes them: an exact-text
    // edit that names `<happy-space ref="…" tree>` must still find it after our edit.
    return `${nav.outerHTML.replace(/ (tree|collapsed)=""/g, " $1")}\n`;
}

/**
 * Moves one space within its section or into another, after `afterRef` or first.
 * A space only ever moves among sections' own entries: never into another space,
 * and its tree, which the window draws, goes with it.
 */
export function sidebarDocumentMove(
    html: string,
    ref: string,
    sectionId: string,
    afterRef: string | null,
): string | undefined {
    return edit(html, (nav) => {
        const node = spaceNode(nav, ref);
        const section = sectionNode(nav, sectionId);
        if (!node || !section || afterRef === ref) return false;
        const after = afterRef === null ? null : spaceNode(nav, afterRef);
        if (after === undefined || (after !== null && after.parentElement !== section))
            return false;
        detach(node);
        attach(section, node, after);
        return true;
    });
}

/** Names new work in its section before the document read catches up. */
export function sidebarDocumentInsert(
    html: string,
    ref: string,
    sectionId: string | null,
): string | undefined {
    return edit(html, (nav) => {
        if (spaceNode(nav, ref)) return false;
        const parent = sectionId === null ? nav : sectionNode(nav, sectionId);
        if (!parent) return false;
        const node = nav.ownerDocument.createElement("happy-space");
        node.setAttribute("ref", ref);
        node.setAttribute("tree", "");
        const after = sectionId === null ? nav.querySelector(":scope > happy-space") : null;
        attach(parent, node, after);
        return true;
    });
}

/** Folds or unfolds a space's tree. */
export function sidebarDocumentSpaceFold(html: string, ref: string): string | undefined {
    return edit(html, (nav) => {
        const node = spaceNode(nav, ref);
        if (!node) return false;
        node.toggleAttribute("collapsed");
        return true;
    });
}

/** Folds or unfolds a section. */
export function sidebarDocumentSectionFold(html: string, id: string): string | undefined {
    return edit(html, (nav) => {
        const node = sectionNode(nav, id);
        if (!node) return false;
        node.toggleAttribute("collapsed");
        return true;
    });
}
