import type { ArtifactVersion } from "@slopus/happy-agent-client";
import { describe, expect, it } from "vitest";
import { happyAgentArtifactVersionProject } from "./artifactProject.js";

const entry = { path: "index.html", mimeType: "text/html", size: 10, sha256: "a".repeat(64) };

/** A version as the daemon sends it, with `background` however the wire carried it. */
const wire = (background?: unknown): ArtifactVersion => {
    const version = {
        artifactId: "art_1",
        number: 1,
        title: "Page",
        entry,
        files: [entry],
        createdBy: { kind: "agent", agentId: "agt_chief", botId: null },
        source: null,
        createdAt: 1,
    };
    // The pinned client's type has no `background`; the daemon's JSON does.
    return (background === undefined ? version : { ...version, background }) as ArtifactVersion;
};

describe("happyAgentArtifactVersionProject background", () => {
    it("keeps every hex form the daemon may send", () => {
        for (const colour of ["#fff", "#ffff", "#10161c", "#10161c80", "#10161C"])
            expect(happyAgentArtifactVersionProject(wire(colour)).background).toBe(colour);
    });

    it("reads null as no colour", () => {
        expect(happyAgentArtifactVersionProject(wire(null))).not.toHaveProperty("background");
    });

    it("reads a field an older daemon leaves out as no colour", () => {
        expect(happyAgentArtifactVersionProject(wire())).not.toHaveProperty("background");
    });

    it("refuses anything that is not a plain hex colour", () => {
        for (const value of [
            "red",
            "#ff",
            "#fffff",
            "#ggg",
            "#10161c;color:red",
            "url(x)",
            " #fff",
            "#fff ",
            "",
            12,
            {},
        ])
            expect(happyAgentArtifactVersionProject(wire(value))).not.toHaveProperty("background");
    });
});
