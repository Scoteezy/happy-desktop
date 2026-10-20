/**
 * Reads a heap snapshot and reports which objects keep detached DOM nodes alive: for each detached
 * node, the first JavaScript object reached walking its strong retainers toward the roots.
 *
 * Usage: node --import tsx perf/detachedRetainers.ts <file.heapsnapshot>
 */
import { readFile } from "node:fs/promises";

const snapshot = JSON.parse(await readFile(process.argv[2]!, "utf8")) as {
    snapshot: { meta: { node_fields: string[]; edge_fields: string[]; node_types: [string[]]; edge_types: [string[]] } };
    nodes: number[];
    edges: number[];
    strings: string[];
};

const { meta } = snapshot.snapshot;
const nodeFieldCount = meta.node_fields.length;
const edgeFieldCount = meta.edge_fields.length;
const nameOffset = meta.node_fields.indexOf("name");
const edgeCountOffset = meta.node_fields.indexOf("edge_count");
const detachedOffset = meta.node_fields.indexOf("detachedness");
const typeOffset = meta.node_fields.indexOf("type");
const edgeTypeOffset = meta.edge_fields.indexOf("type");
const edgeNameOffset = meta.edge_fields.indexOf("name_or_index");
const edgeToOffset = meta.edge_fields.indexOf("to_node");
const nodeTypes = meta.node_types[0];
const edgeTypes = meta.edge_types[0];
const nodeCount = snapshot.nodes.length / nodeFieldCount;
const name = (node: number) => snapshot.strings[snapshot.nodes[node * nodeFieldCount + nameOffset]!]!;
// Reverse edges, skipping weak ones, so each node's retainers can be walked toward the roots.
const retainers: number[][] = Array.from({ length: nodeCount }, () => []);
const retainerEdge: string[][] = Array.from({ length: nodeCount }, () => []);
let edge = 0;
for (let node = 0; node < nodeCount; node++) {
    const count = snapshot.nodes[node * nodeFieldCount + edgeCountOffset]!;
    for (let i = 0; i < count; i++, edge += edgeFieldCount) {
        const type = edgeTypes[snapshot.edges[edge + edgeTypeOffset]!];
        if (type === "weak") continue;
        const to = snapshot.edges[edge + edgeToOffset]! / nodeFieldCount;
        retainers[to]!.push(node);
        const label = type === "element" || type === "hidden" ? `[${String(snapshot.edges[edge + edgeNameOffset])}]` : snapshot.strings[snapshot.edges[edge + edgeNameOffset]!]!;
        retainerEdge[to]!.push(label);
    }
}
const detached: number[] = [];
for (let node = 0; node < nodeCount; node++) {
    if (snapshot.nodes[node * nodeFieldCount + detachedOffset] === 2) detached.push(node);
}
console.log(`detached DOM objects: ${String(detached.length)}`);
// For each detached node, the first JS (non-DOM, non-system) retainer reached breadth-first.
const owners = new Map<string, number>();
for (const start of detached) {
    const seen = new Set([start]);
    let frontier = [start];
    let found: string | undefined;
    for (let depth = 0; depth < 12 && found === undefined && frontier.length > 0; depth++) {
        const next: number[] = [];
        for (const node of frontier) {
            for (const [index, from] of retainers[node]!.entries()) {
                if (seen.has(from)) continue;
                seen.add(from);
                const fromName = name(from);
                const fromType = nodeTypes[snapshot.nodes[from * nodeFieldCount + typeOffset]!];
                if (snapshot.nodes[from * nodeFieldCount + detachedOffset] !== 2 && fromType !== "hidden" && fromType !== "native" && fromName !== "(system)") {
                    found = `${fromType} ${fromName.slice(0, 60)} .${retainerEdge[node]![index]!}`;
                    break;
                }
                next.push(from);
            }
            if (found !== undefined) break;
        }
        frontier = next;
    }
    const key = found ?? "(no JS retainer within 12 hops)";
    owners.set(key, (owners.get(key) ?? 0) + 1);
}
for (const [owner, count] of [...owners].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(String(count).padStart(7), owner);

// PATHS=1: the shortest strong retaining path from the root to a sample detached node of each kind.
if (process.env.PATHS === "1") {
    const parent = new Int32Array(nodeCount).fill(-1);
    const parentEdge: string[] = new Array(nodeCount);
    const firstEdge = new Int32Array(nodeCount + 1);
    for (let node = 0; node < nodeCount; node++) {
        firstEdge[node + 1] = firstEdge[node]! + snapshot.nodes[node * nodeFieldCount + edgeCountOffset]! * edgeFieldCount;
    }
    parent[0] = 0;
    let queue = [0];
    while (queue.length > 0) {
        const next: number[] = [];
        for (const node of queue) {
            for (let e = firstEdge[node]!; e < firstEdge[node + 1]!; e += edgeFieldCount) {
                const type = edgeTypes[snapshot.edges[e + edgeTypeOffset]!];
                if (type === "weak") continue;
                const to = snapshot.edges[e + edgeToOffset]! / nodeFieldCount;
                if (parent[to] !== -1) continue;
                parent[to] = node;
                parentEdge[to] = type === "element" || type === "hidden" ? `[${String(snapshot.edges[e + edgeNameOffset])}]` : snapshot.strings[snapshot.edges[e + edgeNameOffset]!]!;
                next.push(to);
            }
        }
        queue = next;
    }
    const shown = new Set<string>();
    for (const start of detached) {
        const path: string[] = [];
        for (let node = start; node !== 0 && parent[node]! >= 0 && path.length < 30; node = parent[node]!) {
            path.push(`${name(parent[node]!).slice(0, 48)}.${parentEdge[node]!}`);
        }
        const key = path.slice(-6).join("|");
        if (shown.has(key)) continue;
        shown.add(key);
        console.log("\n" + name(start).slice(0, 30) + "  <=  " + path.reverse().join("  ->  "));
        if (shown.size >= 6) break;
    }
}
