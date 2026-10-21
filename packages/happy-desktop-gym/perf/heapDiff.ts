/**
 * What grew between two heap snapshots of one process, for the leak gym's cause summary.
 *
 * V8 gives every object one ID for the life of the process, so the two snapshots can be compared
 * object by object. The summary lists:
 *
 * - constructors whose live count and size grew the most;
 * - holders: every object's subtree on its shortest strong path from the roots is compared between
 *   the snapshots, and the deepest objects that hold a share of all the growth are named, with the
 *   path that keeps each alive. A buffer whose contents turn over does not grow; a collection that
 *   keeps adding does;
 * - allocation sites of what is still alive, from the sampling heap profiler, when one ran.
 *
 * Snapshots are parsed as a stream, so a daemon's, larger than any V8 string, fits.
 */
import { open } from "node:fs/promises";

interface Snapshot {
    readonly nodeFields: number;
    readonly edgeFields: number;
    readonly nodes: Uint32Array;
    readonly edges: Uint32Array;
    readonly strings: string[];
    readonly nodeTypes: readonly string[];
    readonly edgeTypes: readonly string[];
    readonly offsets: {
        type: number;
        name: number;
        id: number;
        selfSize: number;
        edgeCount: number;
        detachedness: number;
    };
    readonly edgeOffsets: { type: number; name: number; to: number };
}

/** Reads a `.heapsnapshot` without holding its text. */
export async function heapSnapshotRead(path: string): Promise<Snapshot> {
    const file = await open(path);
    const buffer = Buffer.alloc(1 << 22);
    let length = 0;
    let position = 0;
    let fileOffset = 0;
    const fill = async (): Promise<boolean> => {
        if (position < length) return true;
        const { bytesRead } = await file.read(buffer, 0, buffer.length, fileOffset);
        fileOffset += bytesRead;
        length = bytesRead;
        position = 0;
        return bytesRead > 0;
    };
    const until = async (marker: string): Promise<string> => {
        // Text up to and including `marker`; only ever used across the small header and separators.
        let text = "";
        for (;;) {
            if (!(await fill())) throw new Error(`${path}: no ${marker}`);
            const chunk = buffer.toString("latin1", position, length);
            const index = (text.slice(-marker.length) + chunk).indexOf(marker);
            if (index >= 0) {
                const used = index + marker.length - Math.min(text.length, marker.length);
                text += chunk.slice(0, used);
                position += used;
                return text;
            }
            text += chunk;
            position = length;
        }
    };
    const numbers = async (count: number): Promise<Uint32Array> => {
        const out = new Uint32Array(count);
        let index = 0;
        let value = 0;
        let digits = false;
        for (;;) {
            if (!(await fill())) throw new Error(`${path}: truncated`);
            for (; position < length; position += 1) {
                const byte = buffer[position]!;
                if (byte >= 48 && byte <= 57) {
                    value = value * 10 + byte - 48;
                    digits = true;
                } else {
                    if (digits) out[index++] = value;
                    value = 0;
                    digits = false;
                    if (byte === 93) {
                        position += 1;
                        if (index !== count)
                            throw new Error(
                                `${path}: expected ${String(count)} numbers, read ${String(index)}`,
                            );
                        return out;
                    }
                }
            }
        }
    };
    const header = JSON.parse((await until('"nodes":[')).replace(/,\s*"nodes":\[$/, "}")) as {
        snapshot: {
            meta: {
                node_fields: string[];
                edge_fields: string[];
                node_types: [string[]];
                edge_types: [string[]];
            };
            node_count: number;
            edge_count: number;
        };
    };
    const { meta } = header.snapshot;
    const nodes = await numbers(header.snapshot.node_count * meta.node_fields.length);
    await until('"edges":[');
    const edges = await numbers(header.snapshot.edge_count * meta.edge_fields.length);
    await until('"strings":[');
    // Strings: JSON string literals, read one at a time so no single string spans the whole table.
    const strings: string[] = [];
    let pieces: Buffer[] = [];
    let start = -1;
    let escaped = false;
    let done = false;
    while (!done && (await fill())) {
        for (; position < length; position += 1) {
            const byte = buffer[position]!;
            if (start < 0) {
                if (byte === 34) {
                    start = position + 1;
                    pieces = [];
                } else if (byte === 93) {
                    done = true;
                    break;
                }
                continue;
            }
            if (escaped) escaped = false;
            else if (byte === 92) escaped = true;
            else if (byte === 34) {
                pieces.push(buffer.subarray(start, position));
                strings.push(JSON.parse(`"${Buffer.concat(pieces).toString("utf8")}"`) as string);
                start = -1;
            }
        }
        // A literal the buffer ends inside continues at the start of the next read.
        if (start >= 0) {
            pieces.push(Buffer.from(buffer.subarray(start, length)));
            start = 0;
        }
    }
    await file.close();
    const field = (name: string) => meta.node_fields.indexOf(name);
    return {
        edgeFields: meta.edge_fields.length,
        edgeOffsets: {
            name: meta.edge_fields.indexOf("name_or_index"),
            to: meta.edge_fields.indexOf("to_node"),
            type: meta.edge_fields.indexOf("type"),
        },
        edgeTypes: meta.edge_types[0],
        edges,
        nodeFields: meta.node_fields.length,
        nodeTypes: meta.node_types[0],
        nodes,
        offsets: {
            detachedness: field("detachedness"),
            edgeCount: field("edge_count"),
            id: field("id"),
            name: field("name"),
            selfSize: field("self_size"),
            type: field("type"),
        },
        strings,
    };
}

/** The class a node is counted under: its constructor for objects, its kind otherwise. */
function kindOf(snapshot: Snapshot, node: number): string {
    const type =
        snapshot.nodeTypes[snapshot.nodes[node * snapshot.nodeFields + snapshot.offsets.type]!]!;
    const name =
        snapshot.strings[snapshot.nodes[node * snapshot.nodeFields + snapshot.offsets.name]!]!;
    if (type === "object" || type === "native")
        return name.length > 60 ? `${name.slice(0, 57)}...` : name;
    if (type === "closure") return `closure ${name.slice(0, 50) || "(anonymous)"}`;
    if (type.includes("string")) return "(string)";
    return `(${type})`;
}

export interface HeapGrowth {
    readonly constructors: readonly { kind: string; count: number; bytes: number }[];
    /** The deepest objects whose subtree grew by a share of all of it, and the path that keeps each. */
    readonly holders: readonly { holder: string; objects: number; bytes: number; path: string }[];
    /** Net growth of everything reachable. */
    readonly growthBytes: number;
    readonly detachedNodes: { before: number; after: number };
    readonly newBytes: number;
    readonly newObjects: number;
}

/** What `after` holds that `before` did not, by constructor and by the container it grew. */
export function heapGrowth(before: Snapshot, after: Snapshot, top = 8): HeapGrowth {
    const totals = (snapshot: Snapshot) => {
        const byKind = new Map<string, { count: number; bytes: number }>();
        let detached = 0;
        let maxId = 0;
        const count = snapshot.nodes.length / snapshot.nodeFields;
        for (let node = 0; node < count; node += 1) {
            const base = node * snapshot.nodeFields;
            const kind = kindOf(snapshot, node);
            const entry = byKind.get(kind) ?? { bytes: 0, count: 0 };
            entry.count += 1;
            entry.bytes += snapshot.nodes[base + snapshot.offsets.selfSize]!;
            byKind.set(kind, entry);
            if (
                snapshot.offsets.detachedness >= 0 &&
                snapshot.nodes[base + snapshot.offsets.detachedness] === 2
            )
                detached += 1;
            maxId = Math.max(maxId, snapshot.nodes[base + snapshot.offsets.id]!);
        }
        return { byKind, detached, maxId };
    };
    const a = totals(before);
    const b = totals(after);
    const constructors = [...b.byKind]
        .map(([kind, entry]) => ({
            bytes: entry.bytes - (a.byKind.get(kind)?.bytes ?? 0),
            count: entry.count - (a.byKind.get(kind)?.count ?? 0),
            kind,
        }))
        .filter((entry) => entry.bytes > 0)
        .sort((x, y) => y.bytes - x.bytes)
        .slice(0, top);

    // Net growth by holder: every object's retained size (what would be freed with it, from the
    // dominator tree) in both snapshots, compared by object ID. A buffer whose contents turn over
    // keeps its size; a container that keeps adding grows by what it added. Shortest strong paths
    // from the roots are only for naming where a holder lives.
    const retainedBefore = new Map<number, number>();
    {
        const rb = retained(before);
        const n = before.nodes.length / before.nodeFields;
        for (let node = 0; node < n; node += 1)
            if (rb.reached[node] === 1)
                retainedBefore.set(
                    before.nodes[node * before.nodeFields + before.offsets.id]!,
                    rb.size[node]!,
                );
    }
    const ra = retained(after);
    const tb = spanningTree(after);
    const s = after;
    const count = s.nodes.length / s.nodeFields;
    const growth = new Float64Array(count).fill(-Infinity);
    const childMax = new Float64Array(count).fill(-Infinity);
    for (let node = 0; node < count; node += 1) {
        if (ra.reached[node] !== 1) continue;
        const was = retainedBefore.get(s.nodes[node * s.nodeFields + s.offsets.id]!);
        // A new object is no holder of its own: what it retains is its old dominator's growth.
        if (was !== undefined) growth[node] = ra.size[node]! - was;
    }
    for (let node = 1; node < count; node += 1) {
        if (ra.reached[node] !== 1) continue;
        const up = ra.idom[node]!;
        childMax[up] = Math.max(childMax[up]!, growth[node]!);
    }
    const isNew = (node: number) => s.nodes[node * s.nodeFields + s.offsets.id]! > a.maxId;
    const edgeName = (edge: number) => {
        const type = s.edgeTypes[s.edges[edge + s.edgeOffsets.type]!]!;
        const name = s.edges[edge + s.edgeOffsets.name]!;
        return type === "element" || type === "hidden"
            ? `[${String(name)}]`
            : (s.strings[name] ?? "?").slice(0, 40);
    };
    const pathTo = (node: number) => {
        const hops: string[] = [];
        for (
            let at = node;
            at !== 0 && tb.parent[at]! >= 0 && hops.length < 40;
            at = tb.parent[at]!
        ) {
            hops.push(`${kindOf(s, tb.parent[at]!)}.${edgeName(tb.parentEdge[at]!)}`);
        }
        hops.reverse();
        // The roots end of a path is engine plumbing; the end near the object names the code.
        return (hops.length > 9 ? ["…", ...hops.slice(-9)] : hops).join(" → ");
    };
    // Where the growth is: the deepest objects whose retained size grew by a share of all of it,
    // none of whose dominated objects did.
    const total = ra.size[0]! - (retainedBefore.get(before.nodes[before.offsets.id]!) ?? 0);
    const threshold = Math.max(256 * 1024, 0.02 * total);
    const holders: number[] = [];
    for (let node = 1; node < count; node += 1) {
        if (growth[node]! >= threshold && childMax[node]! < threshold) holders.push(node);
    }
    let newBytes = 0;
    let newObjects = 0;
    for (let node = 0; node < count; node += 1) {
        if (!isNew(node)) continue;
        newBytes += s.nodes[node * s.nodeFields + s.offsets.selfSize]!;
        newObjects += 1;
    }
    return {
        constructors,
        detachedNodes: { after: b.detached, before: a.detached },
        growthBytes: total,
        holders: holders
            .sort((x, y) => growth[y]! - growth[x]!)
            .slice(0, 5)
            .map((node) => ({
                bytes: growth[node]!,
                holder: kindOf(s, node),
                objects: ra.count[node]!,
                path: pathTo(node),
            })),
        newBytes,
        newObjects,
    };
}

/**
 * Each object's immediate dominator and retained size, by the iterative algorithm of Cooper,
 * Harvey and Kennedy over a reverse postorder of the strong graph.
 */
function retained(s: Snapshot) {
    const count = s.nodes.length / s.nodeFields;
    const firstEdge = new Float64Array(count + 1);
    for (let node = 0; node < count; node += 1)
        firstEdge[node + 1] =
            firstEdge[node]! + s.nodes[node * s.nodeFields + s.offsets.edgeCount]! * s.edgeFields;
    const weak = s.edgeTypes.indexOf("weak");
    const shortcut = s.edgeTypes.indexOf("shortcut");
    const strong = (edge: number) => {
        const type = s.edges[edge + s.edgeOffsets.type]!;
        return type !== weak && type !== shortcut;
    };
    // Postorder by an explicit-stack depth-first search.
    const post = new Int32Array(count).fill(-1);
    const order = new Uint32Array(count);
    const reached = new Uint8Array(count);
    const cursor = new Float64Array(count);
    const stack = new Uint32Array(count);
    let top = 0;
    let numbered = 0;
    stack[top++] = 0;
    reached[0] = 1;
    cursor[0] = firstEdge[0]!;
    while (top > 0) {
        const node = stack[top - 1]!;
        let edge = cursor[node]!;
        let pushed = false;
        for (; edge < firstEdge[node + 1]!; edge += s.edgeFields) {
            if (!strong(edge)) continue;
            const to = s.edges[edge + s.edgeOffsets.to]! / s.nodeFields;
            if (reached[to] === 1) continue;
            reached[to] = 1;
            cursor[node] = edge + s.edgeFields;
            cursor[to] = firstEdge[to]!;
            stack[top++] = to;
            pushed = true;
            break;
        }
        if (pushed) continue;
        top -= 1;
        post[node] = numbered;
        order[numbered++] = node;
    }
    // Predecessors among reached objects.
    const predCount = new Uint32Array(count + 1);
    for (let node = 0; node < count; node += 1) {
        if (reached[node] !== 1) continue;
        for (let edge = firstEdge[node]!; edge < firstEdge[node + 1]!; edge += s.edgeFields)
            if (strong(edge)) predCount[s.edges[edge + s.edgeOffsets.to]! / s.nodeFields + 1]! += 1;
    }
    for (let node = 0; node < count; node += 1)
        predCount[node + 1] = predCount[node + 1]! + predCount[node]!;
    const preds = new Uint32Array(predCount[count]!);
    const fill = predCount.slice(0, count);
    for (let node = 0; node < count; node += 1) {
        if (reached[node] !== 1) continue;
        for (let edge = firstEdge[node]!; edge < firstEdge[node + 1]!; edge += s.edgeFields) {
            if (!strong(edge)) continue;
            const to = s.edges[edge + s.edgeOffsets.to]! / s.nodeFields;
            preds[fill[to]!++] = node;
        }
    }
    // Dominators in postorder numbers; the root has the highest.
    const idom = new Int32Array(numbered).fill(-1);
    const root = post[0]!;
    idom[root] = root;
    const intersect = (left: number, right: number) => {
        while (left !== right) {
            while (left < right) left = idom[left]!;
            while (right < left) right = idom[right]!;
        }
        return left;
    };
    for (let changed = true; changed; ) {
        changed = false;
        for (let index = numbered - 2; index >= 0; index -= 1) {
            const node = order[index]!;
            let next = -1;
            for (let p = predCount[node]!; p < predCount[node + 1]!; p += 1) {
                const from = post[preds[p]!]!;
                if (idom[from] === -1) continue;
                next = next === -1 ? from : intersect(from, next);
            }
            if (next !== -1 && idom[index] !== next) {
                idom[index] = next;
                changed = true;
            }
        }
    }
    const size = new Float64Array(count);
    const objects = new Float64Array(count);
    const dominator = new Int32Array(count).fill(-1);
    for (let index = 0; index < numbered; index += 1) {
        const node = order[index]!;
        size[node] = size[node]! + s.nodes[node * s.nodeFields + s.offsets.selfSize]!;
        objects[node] = objects[node]! + 1;
        if (index === root) continue;
        const up = order[idom[index]!]!;
        dominator[node] = up;
        size[up] = size[up]! + size[node]!;
        objects[up] = objects[up]! + objects[node]!;
    }
    return { count: objects, idom: dominator, reached, size };
}

/** Shortest strong paths from the root, breadth first. */
function spanningTree(s: Snapshot) {
    const count = s.nodes.length / s.nodeFields;
    const firstEdge = new Float64Array(count + 1);
    for (let node = 0; node < count; node += 1)
        firstEdge[node + 1] =
            firstEdge[node]! + s.nodes[node * s.nodeFields + s.offsets.edgeCount]! * s.edgeFields;
    const parent = new Int32Array(count).fill(-1);
    const parentEdge = new Uint32Array(count);
    const order = new Uint32Array(count);
    const weak = s.edgeTypes.indexOf("weak");
    const shortcut = s.edgeTypes.indexOf("shortcut");
    // The DOM and the inspector's own roots reach nearly everything through a React fiber's
    // props; paths through them are walked last, so a path names the JavaScript that keeps an object.
    const late = /^(\(Document DOM trees\)|.*DevTools console.*)$/;
    const element = s.edgeTypes.indexOf("element");
    const hidden = s.edgeTypes.indexOf("hidden");
    const deferred: { node: number; edge: number; to: number }[] = [];
    parent[0] = 0;
    let head = 0;
    let reached = 1;
    for (let pass = 0; pass < 2; pass += 1) {
        if (pass === 1) {
            for (const { node, edge, to } of deferred) {
                if (parent[to] !== -1) continue;
                parent[to] = node;
                parentEdge[to] = edge;
                order[reached++] = to;
            }
        }
        while (head < reached) {
            const node = order[head++]!;
            for (let edge = firstEdge[node]!; edge < firstEdge[node + 1]!; edge += s.edgeFields) {
                const type = s.edges[edge + s.edgeOffsets.type]!;
                if (type === weak || type === shortcut) continue;
                const to = s.edges[edge + s.edgeOffsets.to]! / s.nodeFields;
                if (parent[to] !== -1) continue;
                const named =
                    type === element || type === hidden
                        ? ""
                        : (s.strings[s.edges[edge + s.edgeOffsets.name]!] ?? "");
                if (
                    pass === 0 &&
                    (late.test(named) ||
                        late.test(s.strings[s.nodes[to * s.nodeFields + s.offsets.name]!]!))
                ) {
                    deferred.push({ edge, node, to });
                    continue;
                }
                parent[to] = node;
                parentEdge[to] = edge;
                order[reached++] = to;
            }
        }
    }
    const size = new Float64Array(count);
    const objects = new Float64Array(count);
    for (let index = reached - 1; index >= 0; index -= 1) {
        const node = order[index]!;
        size[node] = size[node]! + s.nodes[node * s.nodeFields + s.offsets.selfSize]!;
        objects[node] = objects[node]! + 1;
        if (index > 0) {
            size[parent[node]!] = size[parent[node]!]! + size[node]!;
            objects[parent[node]!] = objects[parent[node]!]! + objects[node]!;
        }
    }
    return { count: objects, order, parent, parentEdge, reached, size };
}

interface SamplingNode {
    callFrame: { functionName: string; url: string; lineNumber: number };
    selfSize: number;
    children: SamplingNode[];
}

/** Live allocation sites from a sampling heap profile, by the first frame of our own code. */
export function samplingSites(
    profile: { head: SamplingNode },
    top = 6,
): { site: string; bytes: number; stack: string }[] {
    const sites = new Map<string, { bytes: number; stack: string }>();
    const frame = (node: SamplingNode) => {
        const file =
            node.callFrame.url
                .split("/")
                .at(-1)
                ?.replace(/-[A-Za-z0-9_-]{8}\.js$/, ".js") ?? "";
        return `${node.callFrame.functionName || "(anonymous)"} ${file}:${String(node.callFrame.lineNumber + 1)}`;
    };
    const ours = (node: SamplingNode) =>
        node.callFrame.url !== "" &&
        !node.callFrame.url.includes("node_modules") &&
        !node.callFrame.url.startsWith("node:");
    const walk = (node: SamplingNode, stack: SamplingNode[]) => {
        const path = [...stack, node];
        if (node.selfSize > 0) {
            // The innermost frame of our own code names the site; library frames above it say how.
            const own =
                [...path].reverse().find(ours) ??
                [...path].reverse().find((frame) => frame.callFrame.url !== "");
            if (own === undefined) {
                for (const child of node.children) walk(child, path);
                return;
            }
            const site = frame(own);
            const entry = sites.get(site) ?? {
                bytes: 0,
                stack: path.slice(-5).reverse().map(frame).join(" ← "),
            };
            entry.bytes += node.selfSize;
            sites.set(site, entry);
        }
        for (const child of node.children) walk(child, path);
    };
    walk(profile.head, []);
    return [...sites]
        .map(([site, entry]) => ({ site, ...entry }))
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, Math.min(top, 4));
}

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(2)} MB`;

/** The cause summary, a dozen lines. */
export function heapGrowthLines(
    name: string,
    growth: HeapGrowth,
    sites: readonly { site: string; bytes: number; stack: string }[],
): string[] {
    return [
        `${name}: reachable heap grew ${mb(growth.growthBytes)}; ${String(growth.newObjects)} objects (${mb(growth.newBytes)}) allocated since the first snapshot are alive; detached DOM ${String(growth.detachedNodes.before)} → ${String(growth.detachedNodes.after)}`,
        `  top growers by constructor (net):`,
        ...growth.constructors.map(
            (entry) =>
                `    ${mb(entry.bytes).padStart(10)}  ${String(entry.count).padStart(8)}×  ${entry.kind}`,
        ),
        `  where it grew (net growth of what each holds, and the path that keeps it):`,
        ...growth.holders.map(
            (
                entry,
            ) => `    ${mb(entry.bytes).padStart(10)}  ${entry.holder} holding ${String(entry.objects)} objects
                 ${entry.path}`,
        ),
        ...(sites.length === 0
            ? []
            : [
                  `  allocation sites of objects allocated since the first snapshot and alive (sampled, not net):`,
                  ...sites.map(
                      (entry) => `    ${mb(entry.bytes).padStart(10)}  ${entry.site}
                 ${entry.stack}`,
                  ),
              ]),
    ];
}
