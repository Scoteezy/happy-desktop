import type {
    ProjectsVisibilityCacheDocument,
    ProjectsVisibilityDocument,
    ProjectsVisibilityPersistence,
} from "happy-desktop-state";

const CACHE_KEY = "happy.projects-visibility.v2";
const LEGACY_KEY = "happy.projects-visibility.v1";

/** Confirmed per-owner settings and pending writes survive offline restarts. */
export function desktopProjectsVisibilityPersistence(): ProjectsVisibilityPersistence {
    return {
        read() {
            try {
                const value = localStorage.getItem(CACHE_KEY);
                return value ? (JSON.parse(value) as ProjectsVisibilityCacheDocument) : undefined;
            } catch {
                return undefined;
            }
        },
        write(document) {
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify(document));
            } catch {
                // Memory remains usable if the renderer cannot persist its queue.
            }
        },
    };
}

/** Called once the local host identifies its user. Team owners discard this unowned choice. */
export function desktopProjectsVisibilityLegacyConsume(): ProjectsVisibilityDocument | undefined {
    try {
        const value = localStorage.getItem(LEGACY_KEY);
        if (!value) return undefined;
        localStorage.removeItem(LEGACY_KEY);
        return JSON.parse(value) as ProjectsVisibilityDocument;
    } catch {
        return undefined;
    }
}
