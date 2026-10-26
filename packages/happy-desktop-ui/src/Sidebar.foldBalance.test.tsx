import "./styles.css";
import { expect, it } from "vitest";
import { server } from "vitest/browser";
import { Sidebar, type SidebarSection } from "./Sidebar";
import { createRenderer, type RenderedElement } from "./testing";

/*
 * A row's two end marks are balanced in its highlight. Each is centred in a
 * square as tall as the row at its own end — the leading mark 16px from the
 * left edge, the fold 16px from the right — so each sits as far from its side
 * as from the top, and the two insets match. Vertically each sits on the
 * middle of the title's x-height, not on the middle of the row: a chevron's
 * ink rides above the middle of its em, so the fold is lowered onto the text.
 *
 * The fold is held to its alpha-weighted centre as well as its ink box: the
 * request was to put the chevron's visual mass on the text, which is what that
 * centre measures. The open row shows chevron-down and the shut one
 * chevron-right, so both drawings are held to it.
 */

/** One backing pixel at 2x, the step a painted edge moves in. */
const HALF_PIXEL = 0.5 + 1e-6;
const ROW = '[data-happy-desktop-ui="sidebar-item"]';
const sections = (): SidebarSection[] => [
    {
        collapsed: false,
        id: "work",
        items: [
            {
                collapsed: false,
                foldReveal: "always",
                icon: "doc",
                id: "open",
                kind: "view",
                label: "Happy desktop",
            },
            { depth: 1, icon: "doc", id: "child", kind: "view", label: "Child" },
            {
                collapsed: true,
                foldReveal: "always",
                icon: "doc",
                id: "shut",
                kind: "view",
                label: "xxxxxxxx",
            },
            { depth: 1, icon: "doc", id: "hidden", kind: "view", label: "Hidden" },
        ],
        label: "Work",
    },
];

type Ink = {
    /** Visible-ink box edges and alpha centre, from the row's top-left corner. */
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly centroidY: number;
};

async function inkIn(el: RenderedElement<Element>, row: RenderedElement<Element>): Promise<Ink> {
    const ink = await el.visibleMetrics();
    expect(ink.pixelCount).toBeGreaterThan(0);
    const b = el.bounds();
    const r = row.bounds();
    return {
        top: b.y - r.y + ink.bounds.y,
        bottom: b.y - r.y + ink.bounds.y + ink.bounds.height,
        left: b.x - r.x + ink.bounds.x,
        right: b.x - r.x + ink.bounds.x + ink.bounds.width,
        centroidY: b.y - r.y + ink.center.y,
    };
}

it("centres both end marks of a selected row as far from their side as from the top, on the text middle", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <Sidebar
                activeItemId="open"
                data-testid="balance"
                foldControlPlacement="trailing"
                foldControlReveal="hover"
                onItemCollapseToggle={() => {}}
                onItemSelect={() => {}}
                style={{ width: 280 }}
                sections={sections()}
            />
        ),
        { width: 304, height: 200 },
    );
    await view.ready();
    const row = (id: string) => view.$(`${ROW}[data-item-id="${id}"]`);
    const part = (id: string, ui: string) =>
        view.$(`${ROW}[data-item-id="${id}"] [data-happy-desktop-ui="${ui}"]`);
    const glyph = (id: string, ui: string) =>
        view.$(
            `${ROW}[data-item-id="${id}"] [data-happy-desktop-ui="${ui}"] [data-happy-desktop-ui="icon"]`,
        );

    // The x-height band, from a title of x's in the same row geometry.
    const xs = await inkIn(part("shut", "sidebar-item-label"), row("shut"));
    const textMiddle = (xs.top + xs.bottom) / 2;
    expect(row("open").bounds().height).toBe(32);
    expect(getComputedStyle(row("open").element).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");

    for (const id of ["open", "shut"]) {
        const width = row(id).bounds().width;
        const fold = await inkIn(glyph(id, "sidebar-item-fold"), row(id));
        const lead = await inkIn(glyph(id, "sidebar-item-leading"), row(id));
        const foldCentre = { x: (fold.left + fold.right) / 2, y: (fold.top + fold.bottom) / 2 };
        const leadCentre = { x: (lead.left + lead.right) / 2, y: (lead.top + lead.bottom) / 2 };
        const report = JSON.stringify({ browser: server.browser, id, textMiddle, fold, lead });

        // Horizontally each sits 16px in: half the row's height.
        expect(
            Math.abs(width - foldCentre.x - 16),
            `fold right inset ${report}`,
        ).toBeLessThanOrEqual(0.25);
        expect(Math.abs(leadCentre.x - 16), `leading left inset ${report}`).toBeLessThanOrEqual(
            0.25,
        );
        // …so each is as far from its side as from the top, and left matches right.
        expect(
            Math.abs(width - foldCentre.x - foldCentre.y),
            `fold side vs top ${report}`,
        ).toBeLessThanOrEqual(0.75);
        expect(
            Math.abs(width - foldCentre.x - leadCentre.x),
            `left vs right ${report}`,
        ).toBeLessThanOrEqual(HALF_PIXEL);

        // Vertically on the title's x-height middle: the fold by its optical
        // (alpha) centre, which the lowering is set from, and by its ink box.
        expect(
            Math.abs(fold.centroidY - textMiddle),
            `fold optical centre ${report}`,
        ).toBeLessThanOrEqual(0.25);
        expect(Math.abs(foldCentre.y - textMiddle), `fold ink box ${report}`).toBeLessThanOrEqual(
            HALF_PIXEL,
        );
        expect(
            Math.abs(leadCentre.y - textMiddle),
            `leading ink box ${report}`,
        ).toBeLessThanOrEqual(HALF_PIXEL);
    }
}, 120_000);
