import type { ReactNode } from "react";
import { tidyAfter, tidyBefore } from "./tidyFixtures";

const before = new Map(tidyBefore.map((row, index) => [row.id, { row, index }]));
const moved = tidyAfter.filter((row, index) => {
    if (row.visibility === "hidden") return false;
    const original = before.get(row.id);
    return (
        row.visibility === "folded" ||
        original?.index !== index ||
        original.row.section !== row.section ||
        original.row.depth !== row.depth
    );
});

/** Review-only ticks in the workbench gutter, outside the captured app window. */
export function TidyDiffAnnotations(props: { children: ReactNode; enabled: boolean }) {
    if (!props.enabled) return props.children;
    return (
        <div
            data-tidy-diff-workbench
            style={{ display: "flex", flexDirection: "column", position: "relative" }}
            ref={(node) => {
                if (!node) return;
                const update = () => {
                    const window = node.querySelector<HTMLElement>("[data-screen]");
                    if (!window) return;
                    const origin = node.getBoundingClientRect();
                    const bounds = window.getBoundingClientRect();
                    const rows = [
                        ...window.querySelectorAll<HTMLElement>(".happy-sidebar [data-item-id]"),
                    ];
                    for (const tick of node.querySelectorAll<HTMLElement>("[data-tidy-move]")) {
                        const row = rows.find(
                            (row) => row.dataset.itemId === tick.dataset.tidyMove,
                        );
                        const box = row?.getBoundingClientRect();
                        const clip = row
                            ?.closest(".happy-scroll-area__viewport")
                            ?.getBoundingClientRect();
                        tick.style.display =
                            !box ||
                            box.top < Math.max(bounds.top, clip?.top ?? bounds.top) ||
                            box.bottom > Math.min(bounds.bottom, clip?.bottom ?? bounds.bottom)
                                ? "none"
                                : "flex";
                        if (!box) continue;
                        tick.style.left = `${bounds.left - origin.left - 10}px`;
                        tick.style.top = `${box.top - origin.top + box.height / 2 - 1}px`;
                    }
                };
                update();
                const observer = new ResizeObserver(update);
                for (const target of node.querySelectorAll(
                    ".happy-sidebar__body-content, .happy-sidebar__body-viewport, .happy-sidebar__bottom-section",
                ))
                    observer.observe(target);
                node.addEventListener("scroll", update, true);
                return () => {
                    observer.disconnect();
                    node.removeEventListener("scroll", update, true);
                };
            }}
        >
            {props.children}
            {moved.map((row) => (
                <span
                    key={row.id}
                    data-tidy-move={row.id}
                    title={`Moved: ${row.title}`}
                    aria-hidden
                    style={{
                        display: "flex",
                        position: "absolute",
                        width: 5,
                        height: 2,
                        background: "var(--text-secondary)",
                        opacity: 0.6,
                        pointerEvents: "none",
                    }}
                />
            ))}
        </div>
    );
}
