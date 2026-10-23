import { expect, it } from "vitest";
import {
    sidebarDocumentClassicApply,
    sidebarDocumentFold,
    sidebarDocumentInsert,
    sidebarDocumentKey,
    sidebarDocumentMove,
    sidebarDocumentView,
    sidebarDocumentWrite,
    type SidebarDocumentView,
} from "happy-desktop-state";

const HTML = `<nav fold-ribbon="always">
  <happy-search/>
  <happy-create/>
  <happy-space id="happy" expanded="true">
    <happy-space id="aPrioritizing"/>
  </happy-space>
  <happy-section id="desktop" label="Desktop"/>
  <happy-space id="redesign"/>
  <happy-space id="markdown" fold-ribbon="hover"/>
  <happy-section id="later" label="Later" collapsed="true"/>
  <happy-space id="ci"/>
  <happy-separator id="rule"/>
  <happy-space id="tail"/>
</nav>
`;

const keys = (view: SidebarDocumentView) => view.items.map(sidebarDocumentKey);

it("reads the document into one list of items", () => {
    const view = sidebarDocumentView(HTML);
    expect(view.foldRibbon).toBe("always");
    expect(keys(view)).toEqual([
        "search",
        "create",
        "space:happy",
        "section:desktop",
        "space:redesign",
        "space:markdown",
        "section:later",
        "space:ci",
        "separator:rule",
        "space:tail",
    ]);
    expect(view.items[2]).toEqual({
        kind: "space",
        id: "happy",
        expanded: true,
        children: [{ kind: "session", id: "aPrioritizing", expanded: false, children: [] }],
    });
    expect(view.items[5]).toMatchObject({ foldRibbon: "hover" });
});

it("refuses what the window will not draw", () => {
    for (const html of [
        `<nav><happy-search/><happy-create/><script>alert(1)</script></nav>`,
        `<nav><happy-search/><happy-create/><p>hi</p></nav>`,
        `<nav><happy-search/><happy-create/>text</nav>`,
        `<nav><happy-create/></nav>`,
        `<nav><happy-search/><happy-search/><happy-create/></nav>`,
        `<nav><happy-search/><happy-create/><happy-space id="a"/><happy-space id="a"/></nav>`,
        `<nav><happy-search/><happy-create/><happy-space id="a" expanded="yes"/></nav>`,
        `<nav><happy-search/><happy-create/><happy-space id="a" fold-ribbon="never"/></nav>`,
        `<nav><happy-search/><happy-create/><happy-separator/></nav>`,
        `<nav><happy-search/><happy-create/><happy-separator id="s" label="Today"/></nav>`,
        `<nav><happy-search/><happy-create/><happy-separator id="s" collapsed="true"/></nav>`,
        `<nav><happy-search/><happy-create/><happy-section id="s"/></nav>`,
        `<nav><happy-search/><happy-create/><happy-section id="s" label=""/></nav>`,
        `<nav><happy-search/><happy-create/><happy-space id="a"><happy-separator id="s"/></happy-space></nav>`,
        `<nav><happy-search/><happy-create/><happy-space id="a">`,
        `<happy-search/>`,
    ])
        expect(() => sidebarDocumentView(html), html).toThrow();
});

it("moves any item anywhere at the top, and a folded section with its run", () => {
    const view = sidebarDocumentView(HTML);
    expect(keys(sidebarDocumentMove(view, "search", "space:redesign")!)).toEqual([
        "create",
        "space:happy",
        "section:desktop",
        "space:redesign",
        "search",
        "space:markdown",
        "section:later",
        "space:ci",
        "separator:rule",
        "space:tail",
    ]);
    expect(keys(sidebarDocumentMove(view, "section:later", "separator:rule")!)).toEqual([
        "search",
        "create",
        "space:happy",
        "section:desktop",
        "space:redesign",
        "space:markdown",
        "separator:rule",
        "section:later",
        "space:ci",
        "space:tail",
    ]);
    expect(keys(sidebarDocumentMove(view, "section:later", "create")!)).toEqual([
        "search",
        "create",
        "space:happy",
        "section:later",
        "space:ci",
        "section:desktop",
        "space:redesign",
        "space:markdown",
        "separator:rule",
        "space:tail",
    ]);
    // Landing after a folded section lands after its run, so nothing hides.
    expect(keys(sidebarDocumentMove(view, "space:happy", "section:later")!).slice(-4)).toEqual([
        "space:ci",
        "space:happy",
        "separator:rule",
        "space:tail",
    ]);
    expect(sidebarDocumentMove(view, "nobody", null)).toBeUndefined();
    // A session stays among its siblings: a top-level key is not one of them.
    expect(sidebarDocumentMove(view, "session:aPrioritizing", "space:ci")).toBeUndefined();
});

it("moves a section as one block with its rows, expanded or folded", () => {
    const view = sidebarDocumentView(HTML);
    // Expanded: Desktop and both its rows land after the whole Later block.
    expect(keys(sidebarDocumentMove(view, "section:desktop", "section:later")!)).toEqual([
        "search",
        "create",
        "space:happy",
        "section:later",
        "space:ci",
        "section:desktop",
        "space:redesign",
        "space:markdown",
        "separator:rule",
        "space:tail",
    ]);
    // Folded: Later and its hidden row go first, in order.
    expect(keys(sidebarDocumentMove(view, "section:later", null)!)).toEqual([
        "section:later",
        "space:ci",
        "search",
        "create",
        "space:happy",
        "section:desktop",
        "space:redesign",
        "space:markdown",
        "separator:rule",
        "space:tail",
    ]);
    // A section named after a row of the run above lands after that whole run,
    // never between its rows.
    expect(keys(sidebarDocumentMove(view, "section:later", "search")!)).toEqual([
        "search",
        "create",
        "space:happy",
        "section:later",
        "space:ci",
        "section:desktop",
        "space:redesign",
        "space:markdown",
        "separator:rule",
        "space:tail",
    ]);
    // A plain row dropped under an open section's heading joins that section.
    expect(keys(sidebarDocumentMove(view, "space:tail", "section:desktop")!).slice(3, 6)).toEqual([
        "section:desktop",
        "space:tail",
        "space:redesign",
    ]);
});

it("folds sections, spaces and sessions", () => {
    const view = sidebarDocumentView(HTML);
    expect(sidebarDocumentFold(view, "section:later")!.items[6]).toMatchObject({
        collapsed: false,
    });
    expect(sidebarDocumentFold(view, "space:happy")!.items[2]).toMatchObject({ expanded: false });
});

it("writes the document back as the daemon reads it", () => {
    const view = sidebarDocumentView(HTML);
    expect(sidebarDocumentView(sidebarDocumentWrite(view))).toEqual(view);
    expect(sidebarDocumentWrite(view)).toContain(
        '<happy-section id="later" label="Later" collapsed="true"/>',
    );
    // New work lands right below Happy, after all its nested sessions.
    expect(keys(sidebarDocumentInsert(view, "fresh", null, "happy")!)[3]).toBe("space:fresh");
    // Happy absent, or folded away under a section: right after Create.
    expect(keys(sidebarDocumentInsert(view, "fresh", null, null)!)[2]).toBe("space:fresh");
    const hidden = sidebarDocumentMove(view, "space:happy", "section:later")!;
    expect(keys(sidebarDocumentInsert(hidden, "fresh", null, "happy")!)[2]).toBe("space:fresh");
    const moved = sidebarDocumentMove(view, "create", "section:later")!;
    expect(keys(sidebarDocumentInsert(moved, "fresh", null, null)!).slice(-4)).toEqual([
        "create",
        "space:fresh",
        "separator:rule",
        "space:tail",
    ]);
    // A named section or separator takes it right under itself.
    expect(keys(sidebarDocumentInsert(view, "fresh", "desktop", "happy")!)[4]).toBe("space:fresh");
    expect(keys(sidebarDocumentInsert(view, "fresh", "rule", "happy")!).slice(-2)).toEqual([
        "space:fresh",
        "space:tail",
    ]);
});

it("applies the reader's classic folds and hidden bots to the seed", () => {
    const view = sidebarDocumentClassicApply(sidebarDocumentView(HTML), {
        foldedSpaceIds: new Set(["happy"]),
        foldedSectionIds: new Set(["desktop"]),
        hiddenSpaceIds: new Set(["redesign"]),
    });
    expect(view.items[2]).toMatchObject({ expanded: false });
    expect(view.items[3]).toMatchObject({ collapsed: true });
    expect(keys(view)).not.toContain("space:redesign");
});
