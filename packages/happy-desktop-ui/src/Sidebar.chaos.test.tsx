import "./styles.css";
import { expect, it } from "vitest";
import { useState } from "react";
import { Sidebar, type SidebarItem, type SidebarReorder } from "./Sidebar";
import { createRenderer } from "./testing";

/*
 * Nothing jumps. This is the enforcement of that design principle (DESIGN.md →
 * "Nothing jumps") for the sidebar's drag and drop, run as a seeded chaos test.
 *
 * Every iteration carries a random row, section, separator, Search or Create a
 * random number of slots at a random speed, while a fake daemon answers the way
 * a real one can: late, twice, out of order, after the next drag has started,
 * with batches of new names and marks for unrelated rows (what Prioritizing
 * sends), or by refusing the move. Every element's box is read on every frame,
 * and the run fails on the first frame that breaks the property:
 *
 *   - an element nobody is carrying moves only while it is gliding: it never
 *     changes position in a frame without a running animation (no teleport);
 *   - each of its moves is one glide in one direction, ending somewhere other
 *     than where it began (no snap ahead and glide back);
 *   - it makes at most one such move per drop — exactly one slot of the carried
 *     block, or none — and a refused or unapplied move adds exactly one glide
 *     back to where it started;
 *   - the carried block glides once, in one direction, from where it was let go
 *     to the slot it was previewed in, which is where the list then has it;
 *   - no two elements that nobody is carrying ever overlap;
 *   - once settled the column has no gaps: every neighbour is one gap apart;
 *   - confirmations, echoes and name batches move nothing.
 */

const GAP = 2;

const fixture = (): SidebarItem[] => [
    { icon: "search", id: "search", kind: "view", label: "Search" },
    { icon: "compose", id: "create", kind: "view", label: "Create" },
    { icon: "doc", id: "happy", kind: "view", label: "Happy" },
    { icon: "doc", id: "stem-1", kind: "view", label: "New" },
    { icon: "doc", id: "roadmap", kind: "view", label: "Q4 roadmap" },
    { icon: "doc", id: "launch", kind: "view", label: "Launch checklist" },
    { collapsed: false, id: "tasks", kind: "section", label: "Tasks" },
    { icon: "doc", id: "t1", kind: "view", label: "Task one" },
    { icon: "doc", id: "t2", kind: "view", label: "Task two" },
    { collapsed: false, id: "bots", kind: "section", label: "Bots" },
    { icon: "doc", id: "b1", kind: "view", label: "Bot one" },
    { id: "divider", kind: "separator", label: "" },
    { collapsed: false, id: "later", kind: "section", label: "Later" },
    { icon: "doc", id: "l1", kind: "view", label: "Later one" },
    { icon: "doc", id: "l2", kind: "view", label: "Later two" },
];

/* The same peers the sidebar drags among: a section with its rows, a separator
   alone, the rows before the first section as one run; any other row alone. */
const sectionBlocks = (items: readonly SidebarItem[]): SidebarItem[][] => {
    const blocks: SidebarItem[][] = [];
    let open = false;
    for (const item of items) {
        const breaks = item.kind === "section" || item.kind === "separator";
        if (breaks || !open || blocks.length === 0) blocks.push([item]);
        else blocks.at(-1)!.push(item);
        open = item.kind !== "separator";
    }
    return blocks;
};
const blocksFor = (items: readonly SidebarItem[], id: string): SidebarItem[][] =>
    items.find((item) => item.id === id)?.kind === "section"
        ? sectionBlocks(items)
        : items.map((item) => [item]);
const moveApply = (items: readonly SidebarItem[], move: SidebarReorder): SidebarItem[] => {
    const blocks = blocksFor(items, move.id);
    const from = blocks.findIndex((block) => block[0]!.id === move.id);
    const [block] = blocks.splice(from, 1);
    const at =
        move.afterId === null
            ? 0
            : blocks.findIndex((candidate) => candidate[0]!.id === move.afterId) + 1;
    blocks.splice(at, 0, block!);
    return blocks.flat();
};

const random = (seed: number) => {
    let state = seed >>> 0 || 1;
    return () => {
        state = (Math.imul(state, 1103515245) + 12345) >>> 0;
        return state / 4294967296;
    };
};

type Box = readonly [id: string, top: number, height: number, animated: boolean];
type Frame = { readonly at: number; readonly boxes: readonly Box[] };
type Outcome = "confirm" | "twice" | "late" | "async" | "refuse" | "decline";

const frame = () => new Promise<number>(requestAnimationFrame);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Splits a series of tops into separate moves: runs of change between rests. */
const movesOf = (tops: readonly number[]): number[][] => {
    const moves: number[][] = [];
    let current: number[] | undefined;
    let still = 0;
    for (let index = 1; index < tops.length; index += 1) {
        if (Math.abs(tops[index]! - tops[index - 1]!) < 0.05) {
            still += 1;
            // A glide's tail eases below a twentieth of a pixel per frame for a
            // few frames; three frames of rest end a move.
            if (still >= 3) current = undefined;
            continue;
        }
        still = 0;
        if (!current) {
            current = [tops[index - 1]!];
            moves.push(current);
        }
        current.push(tops[index]!);
    }
    return moves;
};

const check = (
    frames: readonly Frame[],
    carried: ReadonlySet<string>,
    releaseIndex: number,
    outcome: Outcome,
    landed: readonly string[],
): string[] => {
    const problems: string[] = [];
    const ids = frames[0]!.boxes.map(([id]) => id);
    const series = (id: string) =>
        frames.map((entry) => entry.boxes.find(([candidate]) => candidate === id));
    const pitch = frames[0]!.boxes
        .filter(([id]) => carried.has(id))
        .reduce((sum, [, , height]) => sum + height + GAP, 0);
    const returns = outcome === "refuse" || outcome === "decline";
    for (const id of ids) {
        const boxes = series(id);
        if (boxes.some((box) => box === undefined)) {
            problems.push(`${id} left the list`);
            continue;
        }
        const tops = boxes.map((box) => box![1]);
        // The carried block follows the hand until it is let go of.
        const from = carried.has(id) ? releaseIndex : 0;
        for (let index = from + 1; index < boxes.length; index += 1) {
            const step = tops[index]! - tops[index - 1]!;
            if (Math.abs(step) > 0.5 && !boxes[index]![3] && !boxes[index - 1]![3])
                problems.push(
                    `${id} teleported ${step.toFixed(1)}px at frame ${String(index)} with nothing animating it`,
                );
        }
        const moves = movesOf(tops.slice(from));
        for (const move of moves) {
            const net = move.at(-1)! - move[0]!;
            if (Math.abs(net) < 1)
                problems.push(
                    `${id} moved and came back to where it was (${move.map((top) => top.toFixed(1)).join(" ")})`,
                );
            for (let index = 1; index < move.length; index += 1)
                if ((move[index]! - move[index - 1]!) * Math.sign(net) < -0.5) {
                    problems.push(
                        `${id} reversed mid-glide (${move.map((top) => top.toFixed(1)).join(" ")})`,
                    );
                    break;
                }
        }
        if (carried.has(id)) {
            // Let go of, it glides once to its slot; a refused move glides back.
            if (moves.length > (outcome === "refuse" ? 2 : 1))
                problems.push(
                    `${id} was let go of and moved ${String(moves.length)} times: ${moves.map((move) => move.map((top) => top.toFixed(1)).join(" ")).join(" | ")}`,
                );
            continue;
        }
        // A move put back glides aside and back: two moves.
        if (moves.length > (returns ? 2 : 1))
            problems.push(
                `${id} moved ${String(moves.length)} times: ${moves.map((move) => move.map((top) => top.toFixed(1)).join(" ")).join(" | ")}`,
            );
        const travel = tops.at(-1)! - tops[0]!;
        if (
            returns
                ? Math.abs(travel) > 0.5
                : Math.abs(travel) > 0.5 && Math.abs(Math.abs(travel) - pitch) > 0.5
        )
            problems.push(
                `${id} ended ${travel.toFixed(1)}px from where it started (expected ${returns ? "0" : `0 or ±${pitch.toFixed(1)}`})`,
            );
    }
    for (const [index, entry] of frames.entries()) {
        const resting = entry.boxes.filter(([id]) => !carried.has(id)).sort((a, b) => a[1] - b[1]);
        for (let at = 1; at < resting.length; at += 1) {
            const [above, top, height] = resting[at - 1]!;
            const [below, belowTop] = resting[at]!;
            if (belowTop < top + height - 1) {
                problems.push(
                    `${above} and ${below} overlap by ${(top + height - belowTop).toFixed(1)}px at frame ${String(index)}`,
                );
                break;
            }
        }
    }
    const last = [...frames.at(-1)!.boxes].sort((a, b) => a[1] - b[1]);
    for (let at = 1; at < last.length; at += 1) {
        const gap = last[at]![1] - last[at - 1]![1] - last[at - 1]![2];
        if (Math.abs(gap - GAP) > 0.5)
            problems.push(
                `settled gap of ${gap.toFixed(1)}px between ${last[at - 1]![0]} and ${last[at]![0]}`,
            );
    }
    const order = last.map(([id]) => id);
    if (order.join() !== landed.join())
        problems.push(`settled in ${order.join(",")}, expected ${landed.join(",")}`);
    return problems;
};

const chaos = async (seed: number, iterations: number) => {
    const next = random(seed);
    const pick = <T,>(values: readonly T[]): T => values[Math.floor(next() * values.length)]!;
    // The fake daemon: the version the reader holds and the writes it has sent
    // on top of it, kept the way the spaces store keeps them.
    let version = 1;
    let sent = 1;
    let shown = fixture();
    let dragging = false;
    let publish: (items: SidebarItem[]) => void = () => undefined;
    let applyMove: (move: SidebarReorder) => void = () => undefined;
    const show = (items: SidebarItem[]) => {
        shown = items;
        publish(items);
    };
    // A reply for a version older than the one held is dropped; a confirmation
    // keeps whatever later edit is already on screen, as fresh objects.
    const reply = (written: number) => {
        if (written <= version) return;
        version = written;
        show(shown.map((item) => ({ ...item })));
    };
    // Prioritizing: new names and marks for rows, never a new order.
    const prioritize = () => {
        const names = ["Planning", "Ship it", "Fix login", "Review", "Notes", "Inbox zero"];
        show(
            shown.map((item) =>
                item.kind === "separator" || next() < 0.6
                    ? item
                    : {
                          ...item,
                          label: item.kind === "section" ? item.label : pick(names),
                          ...(item.kind === "section" ? {} : { meta: pick(["", "2", "17", "3m"]) }),
                          unread: next() < 0.3,
                      },
            ),
        );
    };

    const Fixture = () => {
        const [items, setItems] = useState(shown);
        publish = setItems;
        return (
            <Sidebar
                activeItemId=""
                foldControlPlacement="trailing"
                onDragChange={(active) => {
                    dragging = active;
                }}
                onItemCollapseToggle={() => {}}
                onItemReorder={(_, move) => applyMove(move)}
                onItemSelect={() => {}}
                sections={[{ id: "spaces", items, label: "" }]}
                style={{ width: 280 }}
            />
        );
    };
    const view = createRenderer().render(() => <Fixture />, { width: 304, height: 640 });
    await view.ready();
    const body = view.$('[data-happy-desktop-ui="sidebar-body-content"]').element;
    const row = (id: string) => body.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
    const read = (): Box[] =>
        [...body.querySelectorAll<HTMLElement>('[data-happy-desktop-ui="sidebar-item"]')].map(
            (node) => {
                const bounds = node.getBoundingClientRect();
                return [
                    node.dataset.itemId!,
                    bounds.top,
                    bounds.height,
                    node.getAnimations().length > 0,
                ] as const;
            },
        );
    const pointer = (target: Element, type: string, x: number, y: number) =>
        target.dispatchEvent(
            new PointerEvent(type, {
                bubbles: true,
                button: 0,
                buttons: type === "pointerup" ? 0 : 1,
                clientX: x,
                clientY: y,
                isPrimary: true,
                pointerId: 1,
                pointerType: "mouse",
            }),
        );
    const later: (() => void)[] = [];

    for (let iteration = 0; iteration < iterations; iteration += 1) {
        const outcome = pick<Outcome>(["confirm", "twice", "late", "async", "refuse", "decline"]);
        const id = pick(shown.map((item) => item.id));
        const slots = Math.floor(next() * 8) - 4 || 1;
        // A refusal puts back the document as the daemon has it, so every
        // earlier write is answered first.
        if (outcome === "refuse") for (const answer of later.splice(0)) answer();
        const before = shown;
        let landed = before.map((item) => item.id);
        let written: number | undefined;
        applyMove = (move) => {
            const items = moveApply(shown, move);
            landed = items.map((item) => item.id);
            if (outcome === "decline") return;
            sent += 1;
            written = sent;
            if (outcome === "async") setTimeout(() => show(items), next() * 40);
            else show(items);
        };
        const carried = new Set(
            blocksFor(shown, id)
                .find((block) => block[0]!.id === id)!
                .map((item) => item.id),
        );

        const frames: Frame[] = [];
        let recording = true;
        let releaseIndex = 0;
        void (async () => {
            while (recording) {
                const at = await frame();
                frames.push({ at, boxes: read() });
            }
        })();
        await frame();

        // Carry it: past the drag threshold, then a monotonic path at a random
        // speed, with replies and name batches arriving mid-drag.
        const start = row(id).getBoundingClientRect();
        const x = start.left + 60;
        const y = start.top + start.height / 2;
        pointer(row(id), "pointerdown", x, y);
        pointer(body, "pointermove", x, y + Math.sign(slots) * 8);
        const steps = 2 + Math.floor(next() * 14);
        const travel = slots * 34;
        for (let step = 1; step <= steps; step += 1) {
            pointer(body, "pointermove", x, y + Math.sign(slots) * 8 + (travel * step) / steps);
            for (let wait = Math.floor(next() * 3); wait >= 0; wait -= 1) await frame();
            if (next() < 0.25) later.shift()?.();
            if (next() < 0.2) prioritize();
            if (next() < 0.1) show(shown.map((item) => ({ ...item })));
        }
        for (let wait = Math.floor(next() * 4); wait >= 0; wait -= 1) await frame();
        // Whatever the list previews at the moment of release is where it lands:
        // the hole the other rows have opened for the carried block, each row
        // read where its glide is taking it rather than where it has got to.
        const resting = [
            ...body.querySelectorAll<HTMLElement>('[data-happy-desktop-ui="sidebar-item"]'),
        ]
            .filter((node) => !carried.has(node.dataset.itemId!))
            .map((node) => {
                const bounds = node.getBoundingClientRect();
                const painted = Number.parseFloat(getComputedStyle(node).top) || 0;
                const authored = Number.parseFloat(node.style.top) || 0;
                return [
                    node.dataset.itemId!,
                    bounds.top - painted + authored,
                    bounds.height,
                ] as const;
            })
            .sort((a, b) => a[1] - b[1]);
        let hole = resting.findIndex(
            ([, top], index) =>
                top -
                    (index === 0
                        ? frames[0]!.boxes.reduce((least, box) => Math.min(least, box[1]), Infinity)
                        : resting[index - 1]![1] + resting[index - 1]![2] + GAP) >
                GAP + 1,
        );
        if (hole < 0) hole = resting.length;
        const preview = resting.map(([candidate]) => candidate);
        preview.splice(
            hole,
            0,
            ...before.map((item) => item.id).filter((item) => carried.has(item)),
        );
        releaseIndex = frames.length;
        pointer(body, "pointerup", x, y + Math.sign(slots) * 8 + travel);
        expect(dragging, "the drag ended").toBe(false);
        expect(landed, `seed ${String(seed)} #${String(iteration)}: lands as previewed`).toEqual(
            preview,
        );

        // The daemon answers.
        const answer = written;
        if (answer !== undefined) {
            if (outcome === "refuse") {
                await wait(240 + next() * 160);
                version = answer;
                show(before.map((item) => ({ ...item })));
                landed = before.map((item) => item.id);
            } else if (outcome === "late") {
                later.push(() => reply(answer));
            } else {
                setTimeout(() => reply(answer), next() * 200);
                if (outcome === "twice")
                    setTimeout(
                        () => {
                            // The same reply delivered again, and an older one after it.
                            reply(answer);
                            reply(answer - 1);
                        },
                        200 + next() * 150,
                    );
            }
        } else if (outcome === "decline") {
            landed = before.map((item) => item.id);
        }
        // Echoes and Prioritizing after the drop as well.
        setTimeout(() => show(shown.map((item) => ({ ...item }))), next() * 300);
        setTimeout(prioritize, next() * 300);
        await wait(outcome === "decline" ? 1000 : 700);
        recording = false;
        await frame();

        const problems = check(frames, carried, releaseIndex, outcome, landed);
        expect(
            problems,
            `seed ${String(seed)} #${String(iteration)}: ${outcome} drag of ${id} by ${String(slots)}`,
        ).toEqual([]);
    }
    for (const answer of later.splice(0)) answer();
};

for (const seed of [11, 29, 47])
    it(`nothing jumps through chaotic drags, replies and name batches (seed ${String(seed)})`, async () => {
        await chaos(seed, 24);
    }, 180_000);
