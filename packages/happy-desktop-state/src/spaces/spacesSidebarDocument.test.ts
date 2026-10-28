import { describe, expect, it } from "vitest";
import {
    sidebarDocumentOf,
    sidebarDocumentSeparatorPin,
    sidebarDocumentViewOf,
    type SidebarDocumentView,
} from "./spacesSidebarDocument.js";

const VIEW: SidebarDocumentView = {
    items: [
        { kind: "search" },
        { kind: "create" },
        { kind: "space", id: "happy", expanded: false, children: [] },
        { kind: "separator", id: "s1" },
        { kind: "section", id: "rel", label: "Releases", collapsed: false },
        { kind: "separator", id: "s2", pin: "bottom" },
        { kind: "space", id: "android", expanded: false, children: [] },
    ],
};

/** Each separator's pin, in order. */
const pins = (view: SidebarDocumentView | undefined) =>
    view?.items.flatMap((item) => (item.kind === "separator" ? [item.pin ?? null] : []));

describe("sidebarDocumentSeparatorPin", () => {
    it("pins a separator to one end", () => {
        expect(pins(sidebarDocumentSeparatorPin(VIEW, "separator:s1", "top"))).toEqual([
            "top",
            "bottom",
        ]);
    });

    it("lets go of the separator already pinned to that end", () => {
        expect(pins(sidebarDocumentSeparatorPin(VIEW, "separator:s1", "bottom"))).toEqual([
            "bottom",
            null,
        ]);
        // Moving a pin to the other end frees the end it held.
        expect(pins(sidebarDocumentSeparatorPin(VIEW, "separator:s2", "top"))).toEqual([
            null,
            "top",
        ]);
    });

    it("unpins, leaving no pin field behind", () => {
        const unpinned = sidebarDocumentSeparatorPin(VIEW, "separator:s2", null);
        expect(pins(unpinned)).toEqual([null, null]);
        expect(unpinned?.items[5]).toEqual({ kind: "separator", id: "s2" });
    });

    it("changes nothing for a pin already so, or for anything but a separator", () => {
        expect(sidebarDocumentSeparatorPin(VIEW, "separator:s2", "bottom")).toBeUndefined();
        expect(sidebarDocumentSeparatorPin(VIEW, "separator:s1", null)).toBeUndefined();
        expect(sidebarDocumentSeparatorPin(VIEW, "section:rel", "top")).toBeUndefined();
        expect(sidebarDocumentSeparatorPin(VIEW, "separator:missing", "top")).toBeUndefined();
    });

    it("carries the pin through the shared grammar's tree and back", () => {
        const pinned = sidebarDocumentSeparatorPin(VIEW, "separator:s1", "top")!;
        const tree = sidebarDocumentOf(pinned);
        expect(tree.items[3]).toEqual({ type: "separator", id: "s1", pin: "top" });
        expect(tree.items[5]).toEqual({ type: "separator", id: "s2", pin: "bottom" });
        expect(sidebarDocumentViewOf(tree)).toEqual(pinned);
    });
});
