import { describe, expect, it } from "vitest";
import {
    sidebarProposalChangeAccept,
    sidebarProposalChangeDecline,
    sidebarProposalDiff,
    type SidebarProposalChange,
} from "./sidebarProposalDiff.js";
import {
    sidebarDocumentKey,
    sidebarDocumentView,
    type SidebarDocumentNode,
    type SidebarDocumentView,
} from "./spacesSidebarDocument.js";

/** A document from its items, one element a line. */
function doc(...items: string[]): SidebarDocumentView {
    return sidebarDocumentView(
        ["<nav>", "<happy-search/>", "<happy-create/>", ...items, "</nav>"].join("\n"),
    );
}
const space = (id: string, ...children: string[]) =>
    children.length === 0
        ? `<happy-space id="${id}"/>`
        : `<happy-space id="${id}" expanded="true">${children.join("")}</happy-space>`;
const section = (id: string, label: string) => `<happy-section id="${id}" label="${label}"/>`;

/** The document's outline: each node's key, with what is nested under it in brackets. */
function outline(view: SidebarDocumentView): string {
    const node = (entry: SidebarDocumentNode): string => {
        const children = entry.kind === "space" || entry.kind === "session" ? entry.children : [];
        const key = sidebarDocumentKey(entry);
        return children.length === 0 ? key : `${key}(${children.map(node).join(" ")})`;
    };
    return view.items.map(node).join(" ");
}

/** Each change in brief: kind, node, and the rows a whole-section change takes. */
function brief(changes: readonly SidebarProposalChange[]): string[] {
    return changes.map(
        (change) =>
            `${change.kind} ${change.key}${change.members.length > 0 ? ` [${change.members.join(" ")}]` : ""}`,
    );
}

/*
 * A person's sidebar and Prioritizing's proposal for it: Writing moved to the
 * top as one block, Notarize moved to Releases, Latency to Research, a session
 * brought in, two tasks archived, and Old experiments archived as one block.
 */
const CURRENT = doc(
    space("happy"),
    section("rel", "Releases"),
    space("sign"),
    space("ship"),
    section("desk", "Desktop"),
    space("diffs", space("argon")),
    space("latency"),
    space("notarize"),
    section("res", "Research"),
    space("bench"),
    space("flaky"),
    section("wri", "Writing"),
    space("launch"),
    space("changelog"),
    section("old", "Old experiments"),
    space("dither"),
    space("clone"),
);
const PROPOSED = doc(
    space("happy"),
    section("wri", "Writing"),
    space("changelog"),
    space("launch"),
    section("rel", "Releases"),
    space("sign"),
    space("notarize"),
    section("desk", "Desktop"),
    space("diffs", space("argon")),
    section("res", "Research"),
    space("bench"),
    space("latency"),
    space("gym"),
    section("archive", "Archive"),
    space("ship"),
    space("flaky"),
    space("dither"),
    space("clone"),
);

describe("sidebarProposalDiff", () => {
    it("reads moves, a new row, archives and whole sections from the two trees", () => {
        const diff = sidebarProposalDiff(CURRENT, PROPOSED);
        expect(brief(diff.changes)).toEqual([
            "move section:wri [space:launch space:changelog]",
            "move space:notarize",
            "move space:latency",
            "insert space:gym",
            "archive space:ship",
            "archive space:flaky",
            "archive section:old [space:dither space:clone]",
        ]);
        const byKey = new Map(diff.changes.map((change) => [change.key, change]));
        expect(byKey.get("space:notarize")).toMatchObject({
            from: { kind: "top", head: "section:desk" },
            to: { kind: "top", head: "section:rel" },
            ghost: { parent: null, after: { kind: "node", key: "space:sign", end: "node" } },
        });
        // Latency lands after Bench, and the new row after Latency's own arrival.
        expect(byKey.get("space:latency")?.ghost?.after).toEqual({
            kind: "node",
            key: "space:bench",
            end: "node",
        });
        expect(byKey.get("space:gym")?.ghost?.after).toEqual({
            kind: "change",
            change: "move:space:latency",
            end: "node",
        });
        // The section's arrival is its heading and the rows that travel with it,
        // after the whole block it follows.
        const writing = byKey.get("section:wri")!;
        expect(writing.from).toEqual({ kind: "top", head: "section:res" });
        expect(writing.to).toEqual({ kind: "top", head: null });
        expect(writing.ghost?.nodes.map(sidebarDocumentKey)).toEqual([
            "section:wri",
            "space:changelog",
            "space:launch",
        ]);
        expect(writing.ghost?.after).toEqual({ kind: "node", key: "space:happy", end: "block" });
        // Archives are not drawn where they would go: the Archive block is the proposal's.
        expect(byKey.get("space:ship")?.ghost).toBeUndefined();
    });

    it("says nothing of order alone", () => {
        const proposed = doc(
            space("happy"),
            section("res", "Research"),
            space("flaky"),
            space("bench"),
            section("rel", "Releases"),
            space("ship"),
            space("sign"),
        );
        const current = doc(
            space("happy"),
            section("rel", "Releases"),
            space("sign"),
            space("ship"),
            section("res", "Research"),
            space("bench"),
            space("flaky"),
        );
        // Releases or Research moves; reordering inside them is silent.
        expect(brief(sidebarProposalDiff(current, proposed).changes)).toHaveLength(1);
        const rowsOnly = doc(
            space("happy"),
            section("rel", "Releases"),
            space("ship"),
            space("sign"),
            section("res", "Research"),
            space("flaky"),
            space("bench"),
        );
        expect(sidebarProposalDiff(current, rowsOnly).changes).toEqual([]);
        expect(sidebarProposalDiff(current, current).changes).toEqual([]);
    });

    it("takes out a heading on its own without moving the rows it leaves above", () => {
        const current = doc(
            space("happy"),
            section("rel", "Releases"),
            space("sign"),
            section("res", "Research"),
            space("bench"),
        );
        const proposed = doc(
            space("happy"),
            section("rel", "Releases"),
            space("sign"),
            space("bench"),
        );
        expect(brief(sidebarProposalDiff(current, proposed).changes)).toEqual([
            "remove section:res",
        ]);
        // A heading that goes with every one of its rows is one change.
        const emptied = doc(space("happy"), section("rel", "Releases"), space("sign"));
        expect(brief(sidebarProposalDiff(current, emptied).changes)).toEqual([
            "remove section:res [space:bench]",
        ]);
    });

    it("reads sessions hidden, shown and carried under another row", () => {
        const current = doc(space("happy"), space("diffs", space("argon")), space("notes"));
        const proposed = doc(space("happy"), space("diffs", space("bolt"), space("notes")));
        const diff = sidebarProposalDiff(current, proposed);
        // A space carried under a row is one node that moves, named as it stands now.
        expect(brief(diff.changes)).toEqual([
            "insert session:bolt",
            "move space:notes",
            "remove session:argon",
        ]);
        const notes = diff.changes.find((change) => change.key === "space:notes")!;
        expect(notes.from).toEqual({ kind: "top", head: null });
        expect(notes.to).toEqual({ kind: "nested", parent: "space:diffs" });
        expect(notes.ghost).toMatchObject({
            parent: "space:diffs",
            after: { kind: "change", change: "insert:session:bolt", end: "node" },
        });
        expect(outline(sidebarProposalChangeAccept(current, proposed, notes)!)).toBe(
            // First under Diffs, where its arrival is drawn: nothing before it stands now.
            "search create space:happy space:diffs(session:notes session:argon)",
        );
        let all = current;
        for (const change of diff.changes)
            all = sidebarProposalChangeAccept(all, proposed, change) ?? all;
        expect(outline(all)).toBe(outline(proposed));
        // What is nested under a row that goes, goes with it unannounced.
        expect(
            brief(sidebarProposalDiff(current, doc(space("happy"), space("notes"))).changes),
        ).toEqual(["remove space:diffs"]);
    });
});

describe("one change at a time", () => {
    it("accepting a change takes exactly it, as the person's own edit", () => {
        const diff = sidebarProposalDiff(CURRENT, PROPOSED);
        for (const change of diff.changes) {
            const accepted = sidebarProposalChangeAccept(CURRENT, PROPOSED, change);
            // A row's archive is the window's act on the task, not an edit.
            if (change.kind === "archive" && change.members.length === 0) {
                expect(accepted).toBeUndefined();
                continue;
            }
            expect(accepted, change.id).toBeDefined();
            const left = sidebarProposalDiff(accepted!, PROPOSED).changes.map(({ id }) => id);
            expect(left, change.id).not.toContain(change.id);
            // Every other change still waits, except the archived rows of a
            // section whose heading went.
            for (const other of diff.changes)
                if (other.id !== change.id && change.kind !== "archive")
                    expect(left, `${change.id} keeps ${other.id}`).toContain(other.id);
        }
    });

    it("puts a moved row where the proposal draws it", () => {
        const change = sidebarProposalDiff(CURRENT, PROPOSED).changes.find(
            (entry) => entry.key === "space:notarize",
        )!;
        expect(outline(sidebarProposalChangeAccept(CURRENT, PROPOSED, change)!)).toBe(
            outline(
                doc(
                    space("happy"),
                    section("rel", "Releases"),
                    space("sign"),
                    space("notarize"),
                    space("ship"),
                    section("desk", "Desktop"),
                    space("diffs", space("argon")),
                    space("latency"),
                    section("res", "Research"),
                    space("bench"),
                    space("flaky"),
                    section("wri", "Writing"),
                    space("launch"),
                    space("changelog"),
                    section("old", "Old experiments"),
                    space("dither"),
                    space("clone"),
                ),
            ),
        );
    });

    it("moves a section with its whole block, after the block it follows", () => {
        const change = sidebarProposalDiff(CURRENT, PROPOSED).changes[0]!;
        const accepted = outline(sidebarProposalChangeAccept(CURRENT, PROPOSED, change)!);
        expect(
            accepted.startsWith(
                "search create space:happy section:wri space:launch space:changelog section:rel",
            ),
        ).toBe(true);
    });

    it("brings the section a row moves into when the sidebar lacks it", () => {
        const current = doc(space("happy"), section("rel", "Releases"), space("sign"));
        const proposed = doc(
            space("happy"),
            section("rel", "Releases"),
            section("new", "New"),
            space("sign"),
        );
        const diff = sidebarProposalDiff(current, proposed);
        expect(brief(diff.changes)).toEqual(["insert section:new", "move space:sign"]);
        const accepted = sidebarProposalChangeAccept(current, proposed, diff.changes[1]!)!;
        expect(outline(accepted)).toBe(outline(proposed));
        expect(sidebarProposalDiff(accepted, proposed).changes).toEqual([]);
    });

    it("declining a change takes exactly it back out of the proposal", () => {
        const diff = sidebarProposalDiff(CURRENT, PROPOSED);
        for (const change of diff.changes) {
            const declined = sidebarProposalChangeDecline(PROPOSED, CURRENT, change);
            expect(declined, change.id).toBeDefined();
            const left = sidebarProposalDiff(CURRENT, declined!).changes.map(({ id }) => id);
            expect(left, change.id).not.toContain(change.id);
            for (const other of diff.changes)
                if (other.id !== change.id)
                    expect(left, `${change.id} keeps ${other.id}`).toContain(other.id);
        }
    });

    it("declining every change leaves the proposal saying nothing", () => {
        const diff = sidebarProposalDiff(CURRENT, PROPOSED);
        const declined = diff.changes.reduce<SidebarDocumentView>(
            (proposal, change) =>
                sidebarProposalChangeDecline(proposal, CURRENT, change) ?? proposal,
            PROPOSED,
        );
        expect(sidebarProposalDiff(CURRENT, declined).changes).toEqual([]);
        // The emptied Archive block goes with the last row it offered.
        expect(outline(declined)).not.toContain("section:archive");
    });

    it("accepting every change one by one reaches the proposal", () => {
        let current = CURRENT;
        for (let round = 0; round < 20; round += 1) {
            const next = sidebarProposalDiff(current, PROPOSED).changes.find(
                (change) => change.kind !== "archive",
            );
            if (next === undefined) break;
            current = sidebarProposalChangeAccept(current, PROPOSED, next)!;
        }
        // What is left is only what the window archives.
        expect(brief(sidebarProposalDiff(current, PROPOSED).changes)).toEqual([
            "archive space:ship",
            "archive space:flaky",
            "archive section:old [space:dither space:clone]",
        ]);
    });
});
