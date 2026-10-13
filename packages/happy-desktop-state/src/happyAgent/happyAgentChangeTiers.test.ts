import { describe, expect, it } from "vitest";
import {
    happyAgentChangeTiersAssign,
    type HappyAgentChangeTier,
    type HappyAgentChangeTierId,
} from "./happyAgentChangeTiers.js";

function tier(id: string, patterns: readonly string[]): HappyAgentChangeTier {
    return { id: id as HappyAgentChangeTierId, name: id, patterns, collapsed: false };
}

function files(...paths: string[]): { path: string }[] {
    return paths.map((path) => ({ path }));
}

/** The assignment as plain paths per section, which is what these cases are about. */
function grouped(
    paths: readonly string[],
    tiers: readonly HappyAgentChangeTier[],
): { primary: string[]; tiers: [string, string[]][] } {
    const result = happyAgentChangeTiersAssign(files(...paths), tiers);
    return {
        primary: result.primary.map((file) => file.path),
        tiers: result.tiers.map((entry) => [entry.tier.id, entry.files.map((file) => file.path)]),
    };
}

describe("happyAgentChangeTiersAssign", () => {
    it("leaves every file primary when there are no tiers", () => {
        const changed = files("src/a.ts", "src/a.test.ts");
        const result = happyAgentChangeTiersAssign(changed, []);
        expect(result.primary).toBe(changed);
        expect(result.tiers).toEqual([]);
    });

    it("gives a file to the first tier that matches it", () => {
        expect(
            grouped(
                ["src/a.ts", "src/a.test.ts", "src/b.spec.ts"],
                [tier("tests", ["*.test.ts"]), tier("all-ts", ["*.ts"])],
            ),
        ).toEqual({
            primary: [],
            tiers: [
                ["tests", ["src/a.test.ts"]],
                ["all-ts", ["src/a.ts", "src/b.spec.ts"]],
            ],
        });
    });

    it("matches a pattern without a slash against names anywhere in the tree", () => {
        expect(
            grouped(
                ["a.text.ts", "deep/nested/dir/b.text.ts", "src/c.ts", "src/text.ts"],
                [tier("text", ["*.text.ts"])],
            ),
        ).toEqual({
            primary: ["src/c.ts", "src/text.ts"],
            tiers: [["text", ["a.text.ts", "deep/nested/dir/b.text.ts"]]],
        });
    });

    it("anchors a pattern with a slash to the root", () => {
        expect(
            grouped(
                ["src/a.test.ts", "src/sub/b.test.ts", "lib/src/c.test.ts", "d.test.ts"],
                [tier("src", ["src/*.test.ts"]), tier("rooted", ["/d.test.ts"])],
            ),
        ).toEqual({
            primary: ["src/sub/b.test.ts", "lib/src/c.test.ts"],
            tiers: [
                ["src", ["src/a.test.ts"]],
                ["rooted", ["d.test.ts"]],
            ],
        });
        expect(grouped(["src/sub/b.test.ts"], [tier("deep", ["src/**/*.test.ts"])]).tiers).toEqual([
            ["deep", ["src/sub/b.test.ts"]],
        ]);
    });

    it("claims everything beneath a directory a pattern names", () => {
        expect(
            grouped(
                ["fixtures/a.json", "src/fixtures/b.json", "src/fixtures.ts", "docs/c.md"],
                [tier("fixtures", ["fixtures/"]), tier("docs", ["docs"])],
            ),
        ).toEqual({
            primary: ["src/fixtures.ts"],
            tiers: [
                ["fixtures", ["fixtures/a.json", "src/fixtures/b.json"]],
                ["docs", ["docs/c.md"]],
            ],
        });
    });

    it("leaves out a tier that claims nothing", () => {
        expect(
            grouped(
                ["src/a.ts", "src/a.test.ts"],
                [tier("snapshots", ["*.snap"]), tier("tests", ["*.test.ts"]), tier("empty", [])],
            ),
        ).toEqual({ primary: ["src/a.ts"], tiers: [["tests", ["src/a.test.ts"]]] });
    });

    it("ignores blank lines and comments and honours exclusions", () => {
        expect(
            grouped(
                ["src/a.test.ts", "src/keep.test.ts", ".github/ci.test.ts"],
                [tier("tests", ["", "# tests", "*.test.ts", "!keep.test.ts", "  "])],
            ),
        ).toEqual({
            primary: ["src/keep.test.ts"],
            tiers: [["tests", ["src/a.test.ts", ".github/ci.test.ts"]]],
        });
    });
});
