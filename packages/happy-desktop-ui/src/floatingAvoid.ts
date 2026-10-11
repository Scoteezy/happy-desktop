/**
 * Marks a region a floating panel must never cover. The composer carries it:
 * a card that hides what someone is typing is in the way however briefly it
 * is up.
 */
export const FLOATING_AVOID_ATTRIBUTE = "data-happy-floating-avoid";

/** How close a lifted panel may come to the top of the window. */
const TOP_MARGIN = 8;

/**
 * Keeps a panel that hangs above its anchor clear of every marked region.
 *
 * Where the panel at its natural place would overlap a marked region, it is
 * lifted until its bottom sits `gap` above that region's top; elsewhere it
 * stays where its CSS put it. The lift is written to `--happy-floating-lift`
 * on the panel, which its own `bottom` adds, so nothing renders for it.
 *
 * The regions are anywhere in the window and come and go with the route, so
 * this follows the document rather than a React tree: the panel's own size
 * (it is display:none while folded), each region's size, the window's, and
 * the document's structure, at most once a frame. Returns the one teardown.
 */
export function floatingAvoidBind(panel: HTMLElement, gap: number): () => void {
    const view = panel.ownerDocument.defaultView;
    if (view === null) return () => undefined;
    const document = panel.ownerDocument;
    let lift = 0;
    let frame: number | undefined;
    const observed = new Set<Element>();

    const place = (): void => {
        frame = undefined;
        const regions = document.querySelectorAll(`[${FLOATING_AVOID_ATTRIBUTE}]`);
        for (const region of regions) {
            if (observed.has(region)) continue;
            observed.add(region);
            resize.observe(region);
        }
        for (const region of [...observed]) {
            if (region.isConnected) continue;
            observed.delete(region);
            resize.unobserve(region);
        }
        const rect = panel.getBoundingClientRect();
        // Folded away: nothing to place until it opens, which resizes it.
        if (rect.width === 0 && rect.height === 0) return;
        const top = rect.top + lift;
        const bottom = rect.bottom + lift;
        let next = 0;
        for (const region of regions) {
            const area = region.getBoundingClientRect();
            if (area.width === 0 || area.height === 0) continue;
            const across = rect.left < area.right && rect.right > area.left;
            const below = bottom + gap > area.top && top < area.bottom;
            if (across && below) next = Math.max(next, bottom + gap - area.top);
        }
        next = Math.max(0, Math.min(next, top - TOP_MARGIN));
        if (next === lift) return;
        lift = next;
        panel.style.setProperty("--happy-floating-lift", `${String(lift)}px`);
    };
    const schedule = (): void => {
        if (frame === undefined) frame = view.requestAnimationFrame(place);
    };

    const resize = new view.ResizeObserver(schedule);
    resize.observe(panel);
    const structure = new view.MutationObserver(schedule);
    structure.observe(document.body, { childList: true, subtree: true });
    view.addEventListener("resize", schedule);
    schedule();

    return () => {
        if (frame !== undefined) view.cancelAnimationFrame(frame);
        resize.disconnect();
        structure.disconnect();
        view.removeEventListener("resize", schedule);
        panel.style.removeProperty("--happy-floating-lift");
    };
}
