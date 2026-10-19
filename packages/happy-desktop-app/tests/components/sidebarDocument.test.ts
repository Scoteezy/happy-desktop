import { expect, it } from "vitest";
import {
    sidebarDocumentMove,
    sidebarDocumentSectionFold,
    sidebarDocumentSpaceFold,
    sidebarDocumentView,
} from "happy-desktop-state";

const HTML = `<nav>
<happy-space ref="happy" tree></happy-space>
<happy-section id="desktop" label="Desktop">
<happy-space ref="redesign" tree></happy-space>
<happy-space ref="markdown" tree></happy-space>
</happy-section>
<happy-section id="agent" label="Agent">
<happy-space ref="reviewer" tree></happy-space>
</happy-section>
<happy-section id="older" label="Older" collapsed>
<happy-space ref="ci"></happy-space>
</happy-section>
<p class="note">Steve: shared spaces this week</p>
</nav>
`;

const refs = (html: string, sectionId: string) =>
    sidebarDocumentView(html)
        .sections.find((section) => section.id === sectionId)!
        .entries.flatMap((entry) => (entry.kind === "space" ? [entry.ref] : []));

it("reads the document into rows, headings and notes", () => {
    const view = sidebarDocumentView(HTML);
    expect(view.top).toEqual([{ kind: "space", ref: "happy", tree: true, collapsed: false }]);
    expect(view.sections.map((section) => [section.id, section.label, section.collapsed])).toEqual([
        ["desktop", "Desktop", false],
        ["agent", "Agent", false],
        ["older", "Older", true],
    ]);
    expect(view.bottom).toEqual([
        { kind: "html", html: '<p class="note">Steve: shared spaces this week</p>' },
    ]);
});

it("refuses what the window will not draw", () => {
    for (const html of [
        `<nav><script>alert(1)</script></nav>`,
        `<nav><p onclick="x()">hi</p></nav>`,
        `<nav><a href="https://example.com">x</a></nav>`,
        `<nav><happy-space ref="a"></happy-space><happy-space ref="a"></happy-space></nav>`,
        `<nav><happy-space ref="a"><happy-space ref="b"></happy-space></happy-space></nav>`,
        `<nav><div><happy-section id="s" label="S"></happy-section></div></nav>`,
        `<nav></nav><nav></nav>`,
    ])
        expect(() => sidebarDocumentView(html), html).toThrow();
});

it("reorders a space within its section", () => {
    const moved = sidebarDocumentMove(HTML, "markdown", "desktop", null)!;
    expect(refs(moved, "desktop")).toEqual(["markdown", "redesign"]);
});

it("moves a space into another section, and only into a section", () => {
    const moved = sidebarDocumentMove(HTML, "reviewer", "desktop", "redesign")!;
    expect(refs(moved, "desktop")).toEqual(["redesign", "reviewer", "markdown"]);
    expect(refs(moved, "agent")).toEqual([]);
    // Never after a space that is not in the target section, never into a space.
    expect(sidebarDocumentMove(HTML, "reviewer", "desktop", "ci")).toBeUndefined();
    expect(sidebarDocumentMove(HTML, "reviewer", "redesign", null)).toBeUndefined();
    expect(sidebarDocumentMove(HTML, "nobody", "desktop", null)).toBeUndefined();
});

it("folds spaces and sections in the document", () => {
    const folded = sidebarDocumentSpaceFold(HTML, "redesign")!;
    expect(sidebarDocumentView(folded).sections[0]!.entries[0]).toMatchObject({ collapsed: true });
    const open = sidebarDocumentSectionFold(HTML, "older")!;
    expect(sidebarDocumentView(open).sections[2]!.collapsed).toBe(false);
});

it("writes flags bare, so the manager's exact-text edits still match", () => {
    const moved = sidebarDocumentMove(HTML, "markdown", "desktop", null)!;
    expect(moved).toContain('<happy-space ref="markdown" tree></happy-space>');
    expect(sidebarDocumentSpaceFold(moved, "redesign")).toContain(
        '<happy-space ref="redesign" tree collapsed></happy-space>',
    );
    expect(moved).not.toContain('=""');
});
