import type { Page } from "playwright";

/*
 * Nothing jumps, in the real app. The short Electron counterpart of the
 * sidebar's chaos test (happy-desktop-ui `Sidebar.chaos.test.tsx`): seeded random
 * drags of rows, sections, the separator, Search and Create, at random speeds,
 * in the Spaces sidebar of the hidden window against the real daemon. Its own
 * replies arrive however they arrive; a second author rewrites the document
 * unchanged mid-drag and after the drop, so every drag also meets echoes that
 * must move nothing.
 *
 * Every sidebar row's box is read on every frame from press until well after
 * the drop has settled, and the property is the same one the browser test
 * proves: a row nobody is carrying moves only while it is gliding, each move is
 * one glide in one direction, it makes at most one per drop — by exactly the
 * carried block, or not at all — and nothing overlaps or leaves a gap.
 */

type Box = readonly [id: string, top: number, height: number, carried: boolean, animated: boolean];
type Frame = readonly [at: number, boxes: readonly Box[]];

const ROWS = '[data-happy-desktop-ui="sidebar-item"]';
const GAP = 2;

export interface SidebarDragChaosOptions {
    readonly seed: number;
    readonly drags: number;
    /** Writes the sidebar document back unchanged as another author. */
    readonly echo?: () => Promise<void>;
}

export interface SidebarDragChaosDrag {
    readonly id: string;
    /** The rows on screen before the drag, in order. */
    readonly start: readonly string[];
    readonly slots: number;
    readonly stepMs: number;
    readonly order: readonly string[];
    readonly problems: readonly string[];
    /** Every frame of a drag that broke the property, for reading back. */
    readonly frames?: readonly Frame[];
    readonly releaseAt?: number;
}

export interface SidebarDragChaosResult {
    readonly drags: readonly SidebarDragChaosDrag[];
    readonly problems: readonly string[];
}

/** Splits a series of tops into separate moves: runs of change between rests. */
function movesOf(tops: readonly number[]): number[][] {
    const moves: number[][] = [];
    let current: number[] | undefined;
    let still = 0;
    for (let index = 1; index < tops.length; index += 1) {
        if (Math.abs(tops[index]! - tops[index - 1]!) < 0.05) {
            still += 1;
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
}

export function sidebarDragChaosCheck(
    frames: readonly Frame[],
    releaseAt: number,
    start: readonly string[],
): string[] {
    const problems: string[] = [];
    const carried = new Set<string>();
    for (const [, boxes] of frames) for (const box of boxes) if (box[3]) carried.add(box[0]);
    const releaseIndex = Math.max(
        0,
        frames.findIndex(([at]) => at >= releaseAt),
    );
    const order = [...frames.at(-1)![1]].sort((a, b) => a[1] - b[1]).map(([id]) => id);
    const returned = order.join() === start.join();
    const pitch = frames[0]![1]
        .filter(([id]) => carried.has(id))
        .reduce((sum, [, , height]) => sum + height + GAP, 0);
    for (const id of frames[0]![1].map(([candidate]) => candidate)) {
        const boxes = frames.map(([, entries]) => entries.find(([candidate]) => candidate === id));
        if (boxes.some((box) => box === undefined)) {
            problems.push(`${id} left the list`);
            continue;
        }
        const tops = boxes.map((box) => box![1]);
        const from = carried.has(id) ? releaseIndex : 0;
        for (let index = from + 1; index < boxes.length; index += 1) {
            const step = tops[index]! - tops[index - 1]!;
            if (Math.abs(step) > 0.5 && !boxes[index]![4] && !boxes[index - 1]![4])
                problems.push(
                    `${id} teleported ${step.toFixed(1)}px at ${frames[index]![0].toFixed(0)}ms with nothing animating it`,
                );
        }
        const moves = movesOf(tops.slice(from));
        for (const move of moves) {
            const net = move.at(-1)! - move[0]!;
            if (Math.abs(net) < 1) problems.push(`${id} moved and came back to where it was`);
            for (let index = 1; index < move.length; index += 1)
                if ((move[index]! - move[index - 1]!) * Math.sign(net) < -0.5) {
                    problems.push(`${id} reversed mid-glide`);
                    break;
                }
        }
        // A move the daemon refused glides aside and back: two moves.
        if (moves.length > (returned && !carried.has(id) ? 2 : 1))
            problems.push(`${id} moved ${String(moves.length)} times`);
        if (carried.has(id)) continue;
        const travel = tops.at(-1)! - tops[0]!;
        if (Math.abs(travel) > 0.5 && Math.abs(Math.abs(travel) - pitch) > 0.5)
            problems.push(`${id} ended ${travel.toFixed(1)}px away, not 0 or ±${pitch.toFixed(1)}`);
    }
    let overlaps = 0;
    for (const [at, boxes] of frames) {
        const resting = boxes.filter(([id]) => !carried.has(id)).sort((a, b) => a[1] - b[1]);
        for (let index = 1; index < resting.length; index += 1) {
            const [above, top, height] = resting[index - 1]!;
            const [below, belowTop] = resting[index]!;
            if (belowTop < top + height - 1 && overlaps++ < 4)
                problems.push(`${above} and ${below} overlap at ${at.toFixed(0)}ms`);
        }
    }
    const last = [...frames.at(-1)![1]].sort((a, b) => a[1] - b[1]);
    for (let index = 1; index < last.length; index += 1) {
        const gap = last[index]![1] - last[index - 1]![1] - last[index - 1]![2];
        if (Math.abs(gap - GAP) > 0.5)
            problems.push(
                `settled gap of ${gap.toFixed(1)}px between ${last[index - 1]![0]} and ${last[index]![0]}`,
            );
    }
    return problems;
}

/**
 * Records every row's box on every frame until `framesTake`. Sent as source
 * rather than as a function: the TypeScript loader names nested functions
 * with a helper that does not exist inside the page.
 */
const FRAMES_ARM = `(() => {
    const out = { frames: [], releaseAt: Infinity, running: true };
    window.__sidebarDragChaos = out;
    const origin = performance.now();
    document.addEventListener("pointerup", () => { out.releaseAt = performance.now() - origin; }, { capture: true, once: true });
    const tick = () => {
        out.frames.push([performance.now() - origin, [...document.querySelectorAll(${JSON.stringify(ROWS)})].map((node) => {
            const bounds = node.getBoundingClientRect();
            return [node.dataset.itemId ?? "", bounds.top, bounds.height, node.hasAttribute("data-dragging"), node.getAnimations().length > 0];
        })]);
        if (out.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})()`;

async function framesArm(page: Page): Promise<void> {
    await page.evaluate(FRAMES_ARM);
}

async function framesTake(page: Page): Promise<{ frames: Frame[]; releaseAt: number }> {
    return (await page.evaluate(
        "(() => { const out = window.__sidebarDragChaos; out.running = false; return { frames: out.frames, releaseAt: out.releaseAt }; })()",
    )) as { frames: Frame[]; releaseAt: number };
}

export async function sidebarDragChaosRun(
    page: Page,
    options: SidebarDragChaosOptions,
): Promise<SidebarDragChaosResult> {
    let seed = options.seed >>> 0 || 1;
    const random = () => {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        return seed / 4294967296;
    };
    const order = async () =>
        await page
            .locator(ROWS)
            .evaluateAll((nodes) =>
                nodes.map((node) => (node as HTMLElement).dataset.itemId ?? ""),
            );
    const drags: SidebarDragChaosDrag[] = [];
    const echoes: Promise<void>[] = [];
    const echo = (delayMs: number) => {
        if (options.echo)
            echoes.push(
                new Promise((resolve) => setTimeout(resolve, delayMs))
                    .then(options.echo)
                    .catch(() => undefined),
            );
    };
    for (let index = 0; index < options.drags; index += 1) {
        const start = await order();
        // Search and Create first, then a separator and a section, then anything.
        const id =
            index === 0
                ? "search"
                : index === 1
                  ? "create"
                  : index === 2
                    ? start.find((candidate) => candidate.startsWith("separator:"))
                    : index === 3
                      ? start.find((candidate) => candidate.startsWith("section:"))
                      : start[Math.floor(random() * start.length)];
        if (!id || !start.includes(id)) continue;
        const slots = Math.floor(random() * 8) - 4 || 1;
        const stepMs = Math.floor(random() * 24);
        const from = (await page.locator(`${ROWS}[data-item-id="${id}"]`).first().boundingBox())!;
        const x = from.x + 60;
        const y = from.y + from.height / 2;
        await framesArm(page);
        await page.mouse.move(x, y);
        await page.mouse.down();
        const travel = slots * 34;
        const steps = 2 + Math.floor(random() * 30);
        for (let step = 1; step <= steps; step += 1) {
            await page.mouse.move(x + step * 0.2, y + (travel * step) / steps);
            if (stepMs > 0) await page.waitForTimeout(stepMs);
            if (random() < 0.15) echo(0);
        }
        await page.waitForTimeout(Math.floor(random() * 120));
        await page.mouse.up();
        echo(random() * 300);
        echo(400 + random() * 400);
        await page.waitForTimeout(1600);
        const { frames, releaseAt } = await framesTake(page);
        const problems = sidebarDragChaosCheck(frames, releaseAt, start);
        drags.push({
            start,
            id,
            slots,
            stepMs,
            order: await order(),
            problems,
            ...(problems.length > 0 ? { frames, releaseAt } : {}),
        });
        await page.mouse.move(x + 600, y);
    }
    await Promise.all(echoes);
    return {
        drags,
        problems: drags.flatMap((drag, index) =>
            drag.problems.map(
                (problem) =>
                    `drag ${String(index)} (${drag.id} by ${String(drag.slots)}): ${problem}`,
            ),
        ),
    };
}
