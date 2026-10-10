import { describe, expect, it } from "vitest";
import { happyAgentArtifactReferenceResolve } from "./artifactReference.js";

describe("a reference in a Markdown entry at the version root", () => {
    const resolve = (reference: string) =>
        happyAgentArtifactReferenceResolve("index.md", reference);

    it("names the sibling file a relative image points at", () => {
        expect(resolve("images/chart.png")).toEqual({ type: "file", path: "images/chart.png" });
        expect(resolve("./images/chart.png")).toEqual({ type: "file", path: "images/chart.png" });
        expect(resolve("images/./nested/../chart.png")).toEqual({
            type: "file",
            path: "images/chart.png",
        });
    });

    it("decodes each percent-encoded segment the way the daemon does", () => {
        expect(resolve("images/chart%20one.png")).toEqual({
            type: "file",
            path: "images/chart one.png",
        });
        expect(resolve("images/chart one.png")).toEqual({
            type: "file",
            path: "images/chart one.png",
        });
    });

    it("drops a query and keeps a fragment beside the file", () => {
        expect(resolve("data.csv?raw=1")).toEqual({ type: "file", path: "data.csv" });
        expect(resolve("notes.md#results")).toEqual({
            type: "file",
            path: "notes.md",
            fragment: "results",
        });
    });

    it("reads a link into the entry itself as a place in the document", () => {
        expect(resolve("#summary")).toEqual({ type: "fragment", fragment: "summary" });
        expect(resolve("index.md#summary")).toEqual({ type: "fragment", fragment: "summary" });
    });

    it("refuses a reference the browser would take outside the version's files", () => {
        expect(resolve("../2/files/index.md")).toEqual({ type: "none" });
        expect(resolve("/v0/artifacts/a/versions/1/files/index.md")).toEqual({ type: "none" });
        expect(resolve("images/a%2Fb.png")).toEqual({ type: "none" });
        expect(resolve("images//chart.png")).toEqual({ type: "none" });
        expect(resolve("images/")).toEqual({ type: "none" });
    });

    it("keeps web addresses outside the artifact and refuses every other scheme", () => {
        expect(resolve("https://example.com/a.png")).toEqual({
            type: "web",
            url: "https://example.com/a.png",
        });
        expect(resolve("mailto:team@example.com")).toEqual({
            type: "web",
            url: "mailto:team@example.com",
        });
        expect(resolve("javascript:alert(1)")).toEqual({ type: "none" });
        expect(resolve("data:image/png;base64,AAAA")).toEqual({ type: "none" });
        expect(resolve("file:///etc/passwd")).toEqual({ type: "none" });
        expect(resolve("   ")).toEqual({ type: "none" });
    });
});

describe("a reference in an entry inside a folder", () => {
    it("resolves against the entry's own folder, as a browser does", () => {
        expect(happyAgentArtifactReferenceResolve("docs/index.html", "img/hero.jpg")).toEqual({
            type: "file",
            path: "docs/img/hero.jpg",
        });
        expect(happyAgentArtifactReferenceResolve("docs/index.html", "../assets/site.css")).toEqual(
            { type: "file", path: "assets/site.css" },
        );
        expect(happyAgentArtifactReferenceResolve("docs/a b/index.html", "c.png")).toEqual({
            type: "file",
            path: "docs/a b/c.png",
        });
    });
});
