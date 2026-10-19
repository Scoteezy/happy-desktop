import happyMarkUrl from "./assets/sidebar-icons/happy@40.png";

/**
 * The soft clay icon library: one generated raster per work subject, at the
 * sidebar lane (`@40`, a 20px mark at 2×) and the large mark (`@64`). The slug
 * is the contract with Happy Agent, which assigns one to each placed item.
 */
export const CLAY_ICON_SLUGS = [
    "code",
    "new-feature",
    "cli-terminal",
    "refactor",
    "cleanup",
    "wip",
    "project-kickoff",
    "git",
    "pull-request",
    "code-review",
    "revert",
    "open-source",
    "crash",
    "hotfix",
    "flaky",
    "triage",
    "debugging",
    "investigate",
    "testing",
    "build",
    "ci-fix",
    "ci-watcher",
    "config",
    "dependencies",
    "dependency-upgrade",
    "deploy",
    "feature-flag",
    "app-store-release",
    "infra",
    "cloud",
    "database",
    "migration",
    "trend-up",
    "presentation-report",
    "login",
    "permissions",
    "user-account",
    "vulnerability",
    "secrets",
    "privacy",
    "incident",
    "on-call",
    "alerting",
    "marketing",
    "performance",
    "monitoring",
    "design",
    "dark-mode",
    "design-system",
    "navigation",
    "settings",
    "notifications",
    "ux",
    "accessibility",
    "localization",
    "web",
    "location",
    "links",
    "api",
    "architecture",
    "backend",
    "frontend",
    "email",
    "ai",
    "llm",
    "ai-agent",
    "prompt",
    "bots",
    "docs",
    "notes",
    "roadmap",
    "goals",
    "prioritize",
    "blocked",
    "urgent",
    "kanban",
    "brainstorm",
    "milestone-done",
    "team",
    "standup",
    "meeting",
    "feature-request",
    "user-feedback",
    "support",
    "pricing",
    "billing",
    "revenue",
    "home",
    "travel",
    "apple-macos",
    "windows",
    "android",
    "app-store",
    "google-play",
    "javascript",
    "typescript",
    "swift",
    "nodejs",
    "react",
    "expo-react-native",
    "aws",
    "docker",
    "postgres",
    "github",
    "slack",
    "figma",
    "claude",
    "openai",
    "linux",
    "kotlin",
    "python",
    "rust",
    "nextjs",
    "electron",
    "kubernetes",
    "vercel",
    "cloudflare",
    "redis",
    "stripe",
    "linear",
    "bun",
    "golang",
    "java",
    "ruby",
    "firebase",
    "homebrew",
    "datadog",
    "raspberry-pi",
    "local-models",
    "delete-code",
    "rename",
    "move-files",
    "types",
    "typo",
    "formatting",
    "lint",
] as const;

export type ClayIconSlug = (typeof CLAY_ICON_SLUGS)[number];

const slugs: ReadonlySet<string> = new Set(CLAY_ICON_SLUGS);

/** Narrows a slug named by another layer to one this library draws. */
export function clayIconSlugIs(value: string): value is ClayIconSlug {
    return slugs.has(value);
}

function urlsBySlug(modules: Record<string, string>): ReadonlyMap<string, string> {
    return new Map(
        Object.entries(modules).map(([path, url]) => [
            path.slice(path.lastIndexOf("/") + 1, path.lastIndexOf("@")),
            url,
        ]),
    );
}

const small = urlsBySlug(
    import.meta.glob<string>("./assets/clay-icons/*@40.png", {
        eager: true,
        import: "default",
        query: "?url",
    }),
);
const large = urlsBySlug(
    import.meta.glob<string>("./assets/clay-icons/*@64.png", {
        eager: true,
        import: "default",
        query: "?url",
    }),
);

/** The image mark a row, tab, or floaty item wears for one clay subject. */
export function clayIconMark(
    slug: ClayIconSlug,
    size: 40 | 64 = 40,
): { readonly src: string; readonly alt: string } {
    const src = (size === 64 ? large : small).get(slug);
    if (src === undefined) throw new Error(`Clay icon ${slug}@${size} is not bundled.`);
    return { src, alt: "" };
}

/** Happy's own mark, the one identity the library does not assign. */
export function happyIconMark(): { readonly src: string; readonly alt: string } {
    return { src: happyMarkUrl, alt: "" };
}
