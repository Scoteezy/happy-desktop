/**
 * What a sidebar proposal changes in the person's sidebar, read from the two
 * typed trees: which rows it moves to another section or parent, adds, takes
 * out, or archives, and where each row it brings is drawn among the rows that
 * stand now. Order alone is not a change: a row reordered among the rows it
 * already stands with, or a section among the sections, changes nothing that
 * is shown, and neither does a fold, a label or a pin.
 *
 * A heading — a section or a separator — leads a block: itself and every item
 * after it up to the next heading. A row's place is the block it stands in at
 * the top level, or the node it is nested under. A heading's place is the
 * block before it, and moving it carries its whole block.
 *
 * Every change can be taken alone, as the person's own edit of their sidebar
 * (`sidebarProposalChangeAccept`), or taken back out of the proposal
 * (`sidebarProposalChangeDecline`), so accepting the rest leaves it alone.
 */

import {
    sidebarDocumentKey,
    type SidebarDocumentItem,
    type SidebarDocumentNode,
    type SidebarDocumentSession,
    type SidebarDocumentView,
} from "./spacesSidebarDocument.js";

/** The section that, in a proposal only, heads the rows accepting archives. */
const ARCHIVE_KEY = "section:archive";

/** Where a node stands, by the keys of the sidebar that stands now where it has them. */
export type SidebarProposalPlace =
    /**
     * At the top level, in the block the heading `head` leads, or above every
     * heading for `null`. For a heading itself, the block it follows.
     */
    | { readonly kind: "top"; readonly head: string | null }
    /** Nested under the node `parent`. */
    | { readonly kind: "nested"; readonly parent: string };

export type SidebarProposalChangeKind = "move" | "insert" | "remove" | "archive";

/** Where a row the proposal brings is drawn among the rows that stand now. */
export type SidebarProposalAnchor =
    /**
     * Right after the drawn rows of the node `key` of the current sidebar —
     * itself and what is nested under it — and for `block`, after the rest of
     * the block it stands in too.
     */
    | { readonly kind: "node"; readonly key: string; readonly end: "node" | "block" }
    /** Right after the rows another change brings, and for `block` after the rest of that block. */
    | { readonly kind: "change"; readonly change: string; readonly end: "node" | "block" }
    /** First under its parent, or first in the sidebar at the top level. */
    | { readonly kind: "first" };

/** A change's own rows, drawn where it would put them. */
export interface SidebarProposalGhost {
    /**
     * The proposal's nodes, in its order: the node itself, or for a heading
     * that moves its block, the heading then the rows that travel with it.
     */
    readonly nodes: readonly SidebarDocumentNode[];
    /** The current node they are drawn under, by key, or `null` at the top level. */
    readonly parent: string | null;
    readonly after: SidebarProposalAnchor;
}

export interface SidebarProposalChange {
    /** The same for the same change of the same two documents. */
    readonly id: string;
    readonly kind: SidebarProposalChangeKind;
    /**
     * The node it changes, by its key in the sidebar that stands now, or in
     * the proposal for an insert; for a whole section, its heading.
     */
    readonly key: string;
    /**
     * A change to a whole section: the rows that go with its heading, in the
     * current sidebar's order. Empty for a change to one node.
     */
    readonly members: readonly string[];
    /** Where it stands now; absent for an insert. */
    readonly from?: SidebarProposalPlace;
    /** Where it would stand; absent for a removal or an archive. */
    readonly to?: SidebarProposalPlace;
    /** Present for a move or an insert whose rows can be drawn now. */
    readonly ghost?: SidebarProposalGhost;
}

/**
 * The proposal's changes. Moves and inserts come first, in the proposal's
 * order, so each one's `ghost` anchors only on rows already drawn; removals
 * and archives follow in the current sidebar's order.
 */
export interface SidebarProposalDiff {
    readonly changes: readonly SidebarProposalChange[];
}

type Items = readonly SidebarDocumentItem[];

/**
 * A node's identity across both documents, which every step below compares
 * nodes by. A space keeps one identity whether it stands at the top level or
 * nested under a row, where the document's own key names it as a session, so
 * a space carried into or out of a row is one node that moves. Nested IDs are
 * unique across the whole document, so a session may share the space's form.
 */
function identityOf(node: SidebarDocumentNode): string {
    return node.kind === "session"
        ? sidebarDocumentKey({ ...node, kind: "space" })
        : sidebarDocumentKey(node);
}

/** Where one node stands in one document. */
interface Spot {
    readonly node: SidebarDocumentNode;
    /** Its key in this document. */
    readonly key: string;
    /** The node it is nested under, by identity, or `null` at the top level. */
    readonly parent: string | null;
    /** At the top level, the head of the block it stands in; for a heading, of the block before it. */
    readonly head: string | null;
    /** In the document's order across the whole tree. */
    readonly order: number;
}

function headIs(node: SidebarDocumentNode): boolean {
    return node.kind === "section" || node.kind === "separator";
}

function childrenOf(node: SidebarDocumentNode): readonly SidebarDocumentSession[] {
    return node.kind === "space" || node.kind === "session" ? node.children : [];
}

/** Every node of a document, by identity. */
function spotsOf(items: Items): ReadonlyMap<string, Spot> {
    const spots = new Map<string, Spot>();
    let head: string | null = null;
    const nest = (parent: SidebarDocumentNode): void => {
        for (const child of childrenOf(parent)) {
            spots.set(identityOf(child), {
                node: child,
                key: sidebarDocumentKey(child),
                parent: identityOf(parent),
                head: null,
                order: spots.size,
            });
            nest(child);
        }
    };
    for (const item of items) {
        const identity = identityOf(item);
        spots.set(identity, {
            node: item,
            key: sidebarDocumentKey(item),
            parent: null,
            head,
            order: spots.size,
        });
        if (headIs(item)) head = identity;
        nest(item);
    }
    return spots;
}

/** The identities of a heading's block after it, up to the next heading. */
function blockMembers(items: Items, identity: string): string[] {
    const from = items.findIndex((item) => identityOf(item) === identity);
    if (from < 0) return [];
    const members: string[] = [];
    for (let index = from + 1; index < items.length && !headIs(items[index]!); index += 1)
        members.push(identityOf(items[index]!));
    return members;
}

/** The proposal as the sidebar would take it, and the rows its Archive block offers. */
function archiveSplit(proposed: SidebarDocumentView): {
    readonly live: Items;
    readonly archived: ReadonlySet<string>;
} {
    const archived = new Set(blockMembers(proposed.items, ARCHIVE_KEY));
    return {
        live: proposed.items.filter((item) => {
            const identity = identityOf(item);
            return identity !== ARCHIVE_KEY && !archived.has(identity);
        }),
        archived,
    };
}

/** The indices of a longest increasing run of `values`. */
function increasingKept(values: readonly number[]): ReadonlySet<number> {
    const tails: number[] = [];
    const previous: number[] = [];
    for (const [index, value] of values.entries()) {
        let low = 0;
        let high = tails.length;
        while (low < high) {
            const middle = (low + high) >> 1;
            if (values[tails[middle]!]! < value) low = middle + 1;
            else high = middle;
        }
        previous[index] = low > 0 ? tails[low - 1]! : -1;
        tails[low] = index;
    }
    const kept = new Set<number>();
    for (let index = tails.at(-1) ?? -1; index >= 0; index = previous[index]!) kept.add(index);
    return kept;
}

/** What a proposal changes in the current sidebar. */
export function sidebarProposalDiff(
    current: SidebarDocumentView,
    proposed: SidebarDocumentView,
): SidebarProposalDiff {
    const { live, archived } = archiveSplit(proposed);
    const now = spotsOf(current.items);
    const next = spotsOf(live);
    /** A node's key as the current sidebar names it, or the proposal for one it lacks. */
    const keyOf = (identity: string): string =>
        now.get(identity)?.key ?? next.get(identity)?.key ?? identity;
    const placeOf = (spot: Spot): SidebarProposalPlace =>
        spot.parent === null
            ? { kind: "top", head: spot.head }
            : { kind: "nested", parent: keyOf(spot.parent) };
    /** One change by the identities of its node and the rows that go with it. */
    const changeOf = (
        kind: SidebarProposalChangeKind,
        identity: string,
        members: readonly string[],
        from: Spot | undefined,
        to: Spot | undefined,
    ): SidebarProposalChange => ({
        id: `${kind}:${keyOf(identity)}`,
        kind,
        key: keyOf(identity),
        members: members.map(keyOf),
        ...(from ? { from: placeOf(from) } : {}),
        ...(to ? { to: placeOf(to) } : {}),
    });

    // Sections in a new order: as few headings as possible move.
    const heads = [...now.entries()].filter(
        ([identity, spot]) => spot.parent === null && headIs(spot.node) && next.has(identity),
    );
    const kept = increasingKept(heads.map(([identity]) => next.get(identity)!.order));
    const movedHeads = new Set(
        heads.filter((_, index) => !kept.has(index)).map(([identity]) => identity),
    );

    /** Moves and inserts, by identity, with the identities of the rows that travel along. */
    const brought: {
        readonly identity: string;
        readonly members: readonly string[];
        readonly change: SidebarProposalChange;
    }[] = [];
    for (const [identity, spot] of next) {
        const before = now.get(identity);
        if (before === undefined) {
            // What is nested under a new node comes with it.
            if (spot.parent !== null && !now.has(spot.parent)) continue;
            brought.push({
                identity,
                members: [],
                change: changeOf("insert", identity, [], undefined, spot),
            });
            continue;
        }
        if (headIs(spot.node) && spot.parent === null) {
            if (!movedHeads.has(identity)) continue;
            const members = blockMembers(current.items, identity).filter(
                (member) => next.get(member)?.head === identity,
            );
            brought.push({
                identity,
                members,
                change: changeOf("move", identity, members, before, spot),
            });
            continue;
        }
        const moved =
            before.parent !== spot.parent || (spot.parent === null && before.head !== spot.head);
        if (!moved) continue;
        // A heading taken out on its own leaves its rows in the block above,
        // where they already stand: only the heading changes.
        const left = before.head === null ? undefined : now.get(before.head);
        if (
            spot.parent === null &&
            before.parent === null &&
            before.head !== null &&
            !next.has(before.head) &&
            left?.head === spot.head
        )
            continue;
        brought.push({
            identity,
            members: [],
            change: changeOf("move", identity, [], before, spot),
        });
    }

    const gone: { readonly identity: string; readonly kind: "remove" | "archive" }[] = [];
    for (const [identity, spot] of now) {
        if (next.has(identity)) continue;
        // What is nested under a node that goes, goes with it.
        if (spot.parent !== null && !next.has(spot.parent)) continue;
        gone.push({ identity, kind: archived.has(identity) ? "archive" : "remove" });
    }
    // A heading that goes with every row of its block is one change.
    const merged = new Set<string>();
    const leaving = gone.map(({ identity, kind }) => {
        const spot = now.get(identity)!;
        if (!headIs(spot.node)) return changeOf(kind, identity, [], spot, undefined);
        const members = blockMembers(current.items, identity);
        const kinds = new Set(
            members.map((member) => gone.find((other) => other.identity === member)?.kind),
        );
        const whole = [...kinds][0];
        if (members.length === 0 || kinds.size !== 1 || whole === undefined)
            return changeOf(kind, identity, [], spot, undefined);
        for (const member of members) merged.add(keyOf(member));
        return changeOf(whole, identity, members, spot, undefined);
    });

    // Where each row the proposal brings is drawn: after the rows before it in
    // the proposal, among the rows that stand now.
    brought.sort((left, right) => next.get(left.identity)!.order - next.get(right.identity)!.order);
    const drawnBy = new Map<string, string>();
    for (const entry of brought) {
        drawnBy.set(entry.identity, entry.change.id);
        for (const member of entry.members) drawnBy.set(member, entry.change.id);
    }
    const drawn = brought.map(({ identity, members, change }): SidebarProposalChange => {
        const spot = next.get(identity)!;
        if (spot.parent !== null && !now.has(spot.parent)) return change;
        const siblings = nodesUnder(live, spot.parent) ?? [];
        const at = siblings.findIndex((node) => identityOf(node) === identity);
        const end = spot.parent === null && headIs(spot.node) ? "block" : "node";
        let after: SidebarProposalAnchor = { kind: "first" };
        for (let index = at - 1; index >= 0; index -= 1) {
            const before = identityOf(siblings[index]!);
            const owner = drawnBy.get(before);
            if (owner !== undefined && owner !== change.id) {
                after = { kind: "change", change: owner, end };
                break;
            }
            const standing = now.get(before);
            if (standing !== undefined) {
                after = { kind: "node", key: standing.key, end };
                break;
            }
        }
        const nodes = [identity, ...members]
            .flatMap((entry) => {
                const node = next.get(entry);
                return node ? [node] : [];
            })
            .sort((left, right) => left.order - right.order)
            .map((entry) => entry.node);
        return {
            ...change,
            ghost: {
                nodes,
                parent: spot.parent === null ? null : keyOf(spot.parent),
                after,
            },
        };
    });
    return {
        changes: [...drawn, ...leaving.filter((change) => !merged.has(change.key))],
    };
}

// Editing either document toward the other, one change at a time.

/** The node `identity` with its siblings, anywhere in `items`. */
function locate(
    items: Items,
    identity: string,
):
    | {
          readonly parent: string | null;
          readonly nodes: readonly SidebarDocumentNode[];
          readonly index: number;
      }
    | undefined {
    const top = items.findIndex((item) => identityOf(item) === identity);
    if (top >= 0) return { parent: null, nodes: items, index: top };
    const search = (parent: SidebarDocumentNode): ReturnType<typeof locate> => {
        const children = childrenOf(parent);
        const index = children.findIndex((child) => identityOf(child) === identity);
        if (index >= 0) return { parent: identityOf(parent), nodes: children, index };
        for (const child of children) {
            const found = search(child);
            if (found) return found;
        }
        return undefined;
    };
    for (const item of items) {
        const found = search(item);
        if (found) return found;
    }
    return undefined;
}

/** The nodes under `parent`, or the top level for `null`; `undefined` when `items` lacks it. */
function nodesUnder(
    items: Items,
    parent: string | null,
): readonly SidebarDocumentNode[] | undefined {
    if (parent === null) return items;
    const found = locate(items, parent);
    return found && childrenOf(found.nodes[found.index]!);
}

/** The nodes under `parent`, or the top level for `null`, replaced. */
function nodesReplace(
    items: Items,
    parent: string | null,
    nodes: readonly SidebarDocumentNode[],
): Items {
    if (parent === null) return nodes as Items;
    const sessions = nodes as readonly SidebarDocumentSession[];
    const replace = <Node extends SidebarDocumentNode>(node: Node): Node => {
        if (node.kind !== "space" && node.kind !== "session") return node;
        if (identityOf(node) === parent) return { ...node, children: sessions };
        return { ...node, children: node.children.map(replace) };
    };
    return items.map(replace);
}

/** `items` without the nodes `identities`, wherever they stand, and what is nested under them. */
function nodesTake(items: Items, identities: ReadonlySet<string>): Items {
    const keep = (nodes: readonly SidebarDocumentSession[]): readonly SidebarDocumentSession[] =>
        nodes
            .filter((node) => !identities.has(identityOf(node)))
            .map((node) => ({ ...node, children: keep(node.children) }));
    return items
        .filter((item) => !identities.has(identityOf(item)))
        .map((item) => (item.kind === "space" ? { ...item, children: keep(item.children) } : item));
}

/** `node` as it may join `items`: without anything nested under it that `items` already holds. */
function nodeFresh(items: Items, node: SidebarDocumentNode): SidebarDocumentNode {
    if (node.kind !== "space" && node.kind !== "session") return node;
    const held = spotsOf(items);
    const fresh = (nodes: readonly SidebarDocumentSession[]): SidebarDocumentSession[] =>
        nodes
            .filter((child) => !held.has(identityOf(child)))
            .map((child) => ({ ...child, children: fresh(child.children) }));
    return { ...node, children: fresh(node.children) };
}

/** A space as it stands at the top level, or nested under a row. */
function conform(node: SidebarDocumentNode, top: boolean): SidebarDocumentNode {
    if (node.kind !== "space" && node.kind !== "session") return node;
    const { kind: _kind, ...fields } = node;
    return top ? { kind: "space", ...fields } : { kind: "session", ...fields };
}

/**
 * How a heading `into` lacks lands after the node it follows: after that
 * node's whole block, so it splits no block, or right after it, past only the
 * rows it does not lead in `from`. A heading that moves always carries and
 * lands its whole block.
 */
type HeadLanding = "block" | "lead";

/**
 * Where the node `identity` of `from` goes in `into`: under the same parent,
 * after the nearest node before it in `from` that stands in the same place in
 * both, or first. `undefined` when `into` lacks the parent.
 */
function slotOf(
    into: Items,
    from: Items,
    identity: string,
    landing: HeadLanding,
): { readonly parent: string | null; readonly at: number } | undefined {
    const source = locate(from, identity);
    if (!source) return undefined;
    const siblings = nodesUnder(into, source.parent);
    if (!siblings) return undefined;
    const intoSpots = spotsOf(into);
    const fromSpots = spotsOf(from);
    const head = source.parent === null && headIs(source.nodes[source.index]!);
    for (let index = source.index - 1; index >= 0; index -= 1) {
        const before = identityOf(source.nodes[index]!);
        const at = siblings.findIndex((node) => identityOf(node) === before);
        if (at < 0) continue;
        // A row that stands in another block in each is no landmark.
        if (
            source.parent === null &&
            !headIs(siblings[at]!) &&
            intoSpots.get(before)?.head !== fromSpots.get(before)?.head
        )
            continue;
        let end = at + 1;
        if (head)
            while (
                end < siblings.length &&
                !headIs(siblings[end]!) &&
                (landing === "block" ||
                    fromSpots.get(identityOf(siblings[end]!))?.head !== identity)
            )
                end += 1;
        return { parent: source.parent, at: end };
    }
    return { parent: source.parent, at: 0 };
}

/** `nodes` put under `parent` at `at`. */
function nodesPut(
    items: Items,
    parent: string | null,
    at: number,
    nodes: readonly SidebarDocumentNode[],
): Items {
    const siblings = nodesUnder(items, parent) ?? [];
    return nodesReplace(items, parent, [...siblings.slice(0, at), ...nodes, ...siblings.slice(at)]);
}

/**
 * `into` with the node `identity` standing where it stands in `from`: moved
 * there, put there when `into` lacks it, or taken out when `from` does. A
 * heading that moves carries its block. The parent or block it lands in is
 * brought first when `into` lacks it.
 */
function adopt(
    into: Items,
    from: Items,
    identity: string,
    landing: HeadLanding,
): Items | undefined {
    const source = locate(from, identity);
    const present = locate(into, identity) !== undefined;
    if (!source) return present ? nodesTake(into, new Set([identity])) : undefined;
    const node = source.nodes[source.index]!;
    const head = source.parent === null && headIs(node);
    let items = into;
    // The place it lands in comes first.
    if (source.parent !== null && !locate(items, source.parent)) {
        const parent = adopt(items, from, source.parent, landing);
        if (!parent) return undefined;
        items = parent;
    } else if (source.parent === null && !head) {
        const block = spotsOf(from).get(identity)?.head ?? null;
        if (block !== null && !locate(items, block))
            items = adopt(items, from, block, landing) ?? items;
    }
    let carried: readonly SidebarDocumentNode[];
    if (present) {
        const here = locate(items, identity)!;
        const run = new Set(
            head && here.parent === null
                ? [identity, ...blockMembers(items, identity)]
                : [identity],
        );
        carried = here.nodes.filter((entry) => run.has(identityOf(entry)));
        items = nodesTake(items, run);
    } else carried = [nodeFresh(items, node)];
    // A space carried into or out of a row takes the shape of where it lands.
    carried = carried.map((entry) => conform(entry, source.parent === null));
    const slot = slotOf(items, from, identity, present && head ? "block" : landing);
    if (!slot) return undefined;
    return nodesPut(items, slot.parent, slot.at, carried);
}

/** The identities of a change's node and its rows, read from the documents that name them. */
function changeIdentities(
    change: SidebarProposalChange,
    ...documents: readonly SidebarDocumentView[]
): readonly [string, ...string[]] | undefined {
    const keyed = new Map<string, string>();
    for (const document of documents)
        for (const [identity, spot] of spotsOf(document.items))
            if (!keyed.has(spot.key)) keyed.set(spot.key, identity);
    const identity = keyed.get(change.key);
    const members = change.members.map((key) => keyed.get(key));
    if (identity === undefined || members.some((member) => member === undefined)) return undefined;
    return [identity, ...(members as string[])];
}

/**
 * The current sidebar with one change taken, as the person's own edit: a move
 * or an insert puts the node where the proposal has it, a removal takes it
 * out. An archive writes nothing here — the window archives the rows — except
 * that a whole section archived loses its heading. `undefined` when there is
 * nothing to write.
 */
export function sidebarProposalChangeAccept(
    current: SidebarDocumentView,
    proposed: SidebarDocumentView,
    change: SidebarProposalChange,
): SidebarDocumentView | undefined {
    const identities = changeIdentities(change, current, proposed);
    if (!identities) return undefined;
    const [identity] = identities;
    let items: Items | undefined;
    switch (change.kind) {
        case "move":
        case "insert":
            items = adopt(current.items, archiveSplit(proposed).live, identity, "block");
            break;
        case "remove":
            items = nodesTake(current.items, new Set(identities));
            break;
        case "archive":
            items =
                change.members.length === 0
                    ? undefined
                    : nodesTake(current.items, new Set([identity]));
            break;
    }
    return items && { ...current, items };
}

/**
 * The proposal without one change: what it moved, added, took out or offered
 * for archiving stands as it stands in the current sidebar. `undefined` when
 * it cannot be taken back.
 */
export function sidebarProposalChangeDecline(
    proposed: SidebarDocumentView,
    current: SidebarDocumentView,
    change: SidebarProposalChange,
): SidebarDocumentView | undefined {
    const identities = changeIdentities(change, current, proposed);
    if (!identities) return undefined;
    let items: Items | undefined = proposed.items;
    // A section that moves takes its block back with its heading; one that
    // went whole comes back heading first, then each of its rows.
    for (const identity of change.kind === "move" ? identities.slice(0, 1) : identities) {
        items = adopt(items, current.items, identity, "lead");
        if (items === undefined) return undefined;
    }
    // An Archive block left empty goes too.
    if (
        change.kind === "archive" &&
        items.some((item) => identityOf(item) === ARCHIVE_KEY) &&
        blockMembers(items, ARCHIVE_KEY).length === 0
    )
        items = nodesTake(items, new Set([ARCHIVE_KEY]));
    return { ...proposed, items };
}
