// Declared beside the state package's sources rather than in a tsconfig, so
// every package that compiles this file through its import sees it too: an
// ambient module declaration cannot be imported.
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="../picomatch.d.ts" />
import picomatch from "picomatch/posix";

declare const happyAgentChangeTierIdBrand: unique symbol;

/** Branded identifier of one change tier, minted by the change tiers store. */
export type HappyAgentChangeTierId = string & { readonly [happyAgentChangeTierIdBrand]: true };

/**
 * A named group of changed files that the reader considers secondary — tests,
 * snapshots, generated code — and wants listed apart from the rest of a change.
 *
 * It is a decision about how a project's changes are read rather than about the
 * work, so it belongs to the reader and the window, never to a Happy Agent.
 */
export interface HappyAgentChangeTier {
    readonly id: HappyAgentChangeTierId;
    /** What the section is called. May be blank while it is being written. */
    readonly name: string;
    /**
     * Glob patterns, one per entry, read the way a `.gitignore` reads them: a
     * pattern without a slash matches a file or directory name anywhere in the
     * checkout, a pattern with one is anchored to the checkout's root, a
     * trailing slash matches directories only, `!` excludes, and blank entries
     * and `#` comments say nothing. Kept verbatim, blank lines included, so the
     * text being edited survives the round trip.
     */
    readonly patterns: readonly string[];
    /** Whether the section is folded shut in the listing. */
    readonly collapsed: boolean;
}

/**
 * How many tiers one project keeps. Far more sections than a narrow listing
 * can usefully show, and bounded so a stuck button cannot grow a heap.
 */
export const HAPPY_AGENT_CHANGE_TIERS_MAX = 16;

/** The files one tier holds, in the order they were given. */
export interface HappyAgentChangeTierFiles<File> {
    readonly tier: HappyAgentChangeTier;
    readonly files: readonly File[];
}

/**
 * A change split into its tiers. `primary` holds every file no tier claims;
 * `tiers` lists, in the configured order, only the tiers that claimed at least
 * one file, so an empty tier never becomes an empty section.
 */
export interface HappyAgentChangeTiersAssignment<File> {
    readonly primary: readonly File[];
    readonly tiers: readonly HappyAgentChangeTierFiles<File>[];
}

interface PatternCompiled {
    readonly test: (path: string) => boolean;
    /** A trailing slash: only a directory can match, never the file itself. */
    readonly directoryOnly: boolean;
    readonly excludes: boolean;
}

interface TierMatcher {
    readonly includes: readonly PatternCompiled[];
    readonly excludes: readonly PatternCompiled[];
}

/** One pattern as a test, or nothing for a blank line, a comment, or a pattern picomatch refuses. */
function patternCompile(raw: string): PatternCompiled | undefined {
    let pattern = raw.trim();
    if (pattern === "" || pattern.startsWith("#")) return undefined;
    const excludes = pattern.startsWith("!");
    if (excludes) pattern = pattern.slice(1);
    const directoryOnly = pattern.endsWith("/");
    pattern = pattern.replace(/\/+$/, "");
    // A leading slash anchors the pattern to the root, which is where a
    // repository-relative path already starts; it only has to stop a bare name
    // from being matched anywhere.
    const anchored = pattern.startsWith("/") || pattern.includes("/");
    pattern = pattern.replace(/^\/+/, "");
    if (pattern === "") return undefined;
    try {
        const test = picomatch(pattern, { dot: true, basename: !anchored });
        return { test, directoryOnly, excludes };
    } catch {
        return undefined;
    }
}

/**
 * Compiled matchers by tier. A tier is immutable and replaced whole when it is
 * edited, so its identity is exactly the identity of its patterns, and a
 * listing redrawn on every store notification compiles each pattern once.
 */
const matchers = new WeakMap<HappyAgentChangeTier, TierMatcher>();

function tierMatcher(tier: HappyAgentChangeTier): TierMatcher {
    const cached = matchers.get(tier);
    if (cached) return cached;
    const includes: PatternCompiled[] = [];
    const excludes: PatternCompiled[] = [];
    for (const raw of tier.patterns) {
        const compiled = patternCompile(raw);
        if (compiled) (compiled.excludes ? excludes : includes).push(compiled);
    }
    const matcher = { includes, excludes };
    matchers.set(tier, matcher);
    return matcher;
}

/**
 * Whether a pattern names this file, or a directory the file sits inside. A
 * pattern naming `fixtures` claims everything beneath a `fixtures` directory,
 * the same as it would in a `.gitignore`.
 */
function patternMatches(pattern: PatternCompiled, segments: readonly string[]): boolean {
    let prefix = "";
    for (let index = 0; index < segments.length; index += 1) {
        prefix = index === 0 ? segments[0]! : `${prefix}/${segments[index]!}`;
        const file = index === segments.length - 1;
        if (file && pattern.directoryOnly) return false;
        if (pattern.test(prefix)) return true;
    }
    return false;
}

function tierMatches(matcher: TierMatcher, segments: readonly string[]): boolean {
    return (
        matcher.includes.some((pattern) => patternMatches(pattern, segments)) &&
        !matcher.excludes.some((pattern) => patternMatches(pattern, segments))
    );
}

/**
 * Splits changed files across the reader's tiers.
 *
 * Each file goes to the first tier, in the configured order, whose patterns
 * match its repository-relative path; a file no tier claims stays in
 * `primary`. Nothing is dropped and nothing is counted twice: the tiers only
 * regroup the change.
 */
export function happyAgentChangeTiersAssign<File extends { readonly path: string }>(
    files: readonly File[],
    tiers: readonly HappyAgentChangeTier[],
): HappyAgentChangeTiersAssignment<File> {
    if (tiers.length === 0) return { primary: files, tiers: [] };
    const compiled = tiers.map((tier) => ({ tier, matcher: tierMatcher(tier) }));
    const primary: File[] = [];
    const claimed = compiled.map((): File[] => []);
    for (const file of files) {
        const segments = file.path.split("/").filter((segment) => segment.length > 0);
        const index = compiled.findIndex((entry) => tierMatches(entry.matcher, segments));
        if (index === -1) primary.push(file);
        else claimed[index]!.push(file);
    }
    return {
        primary,
        tiers: compiled.flatMap((entry, index) =>
            claimed[index]!.length === 0 ? [] : [{ tier: entry.tier, files: claimed[index]! }],
        ),
    };
}
