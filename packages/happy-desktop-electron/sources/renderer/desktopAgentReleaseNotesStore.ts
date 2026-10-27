import type { AppHappyAgentDaemonStore, AppHappyAgentReleaseNotesStore } from "happy-desktop-app";
import type { SidebarUpdateNotes } from "happy-desktop-ui";
import {
    RELEASE_NOTES_OVERFLOW_THRESHOLD,
    releaseNotesParse,
    releaseNotesProject,
    releaseNotesRange,
    releaseNotesUrl,
    type ReleaseNotesFile,
} from "./desktopAgentReleaseNotes";

/** How long one notes file may take before it counts as unreadable. */
const READ_TIMEOUT_MS = 15_000;
/** How long an unreadable notes file is left alone before it is asked for again. */
const READ_RETRY_MS = 5 * 60_000;

/** What reading one release's notes file came to. */
type NotesRead =
    | { readonly kind: "read"; readonly file: ReleaseNotesFile }
    /** The release has no notes file: it has nothing to say. */
    | { readonly kind: "missing" }
    | { readonly kind: "failed"; readonly at: number };

/**
 * The notes for the Happy Agent version the daemon is offering.
 *
 * The range comes from the daemon's own catalog, which the host already limits
 * to the tags this app's update channel accepts, so this store discovers no
 * releases of its own: it only reads each release's notes file. It starts as
 * soon as a newer version is known, while it is still downloading, so the notes
 * are usually in by the time the update is ready to install. A range too long
 * to list is not read at all.
 *
 * Nothing is published until every release in range has answered, so the card
 * never grows a bullet at a time; a release whose file is missing or cannot be
 * read contributes nothing. Only the current range is cached.
 */
export function desktopAgentReleaseNotesStoreCreate(input: {
    readonly daemon: AppHappyAgentDaemonStore;
    readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
    readonly now?: () => number;
}): AppHappyAgentReleaseNotesStore {
    const now = input.now ?? Date.now;
    const listeners = new Set<() => void>();
    const reads = new Map<string, NotesRead>();
    const reading = new Set<string>();
    let snapshot: SidebarUpdateNotes | undefined;
    let snapshotKey = "null";
    let unsubscribe: (() => void) | undefined;

    const publish = (next: SidebarUpdateNotes | undefined): void => {
        const key = JSON.stringify(next ?? null);
        if (key === snapshotKey) return;
        snapshot = next;
        snapshotKey = key;
        for (const listener of listeners) listener();
    };

    const read = (version: string): void => {
        const url = releaseNotesUrl(version);
        if (url === undefined) {
            reads.set(version, { kind: "missing" });
            return;
        }
        reading.add(version);
        void input
            .fetch(url, { signal: AbortSignal.timeout(READ_TIMEOUT_MS) })
            .then(async (response): Promise<NotesRead> => {
                if (response.status === 404) return { kind: "missing" };
                if (!response.ok) return { at: now(), kind: "failed" };
                return { file: releaseNotesParse(await response.text()), kind: "read" };
            })
            .catch((): NotesRead => ({ at: now(), kind: "failed" }))
            .then((result) => {
                reading.delete(version);
                reads.set(version, result);
                if (unsubscribe) reconcile();
            });
    };

    const reconcile = (): void => {
        const daemon = input.daemon.get();
        const installed = daemon.installedVersion;
        const target =
            daemon.readyVersion ?? (daemon.updateAvailable ? daemon.availableVersion : undefined);
        const range =
            installed === undefined || target === undefined
                ? undefined
                : releaseNotesRange(
                      daemon.versions.map(({ version }) => version),
                      installed,
                      target,
                  );
        if (installed === undefined || target === undefined || range === undefined) {
            reads.clear();
            publish(undefined);
            return;
        }
        for (const version of reads.keys()) {
            if (!range.includes(version)) reads.delete(version);
        }
        if (range.length <= RELEASE_NOTES_OVERFLOW_THRESHOLD) {
            for (const version of range) {
                const known = reads.get(version);
                const due =
                    known === undefined ||
                    (known.kind === "failed" && now() - known.at >= READ_RETRY_MS);
                if (due && !reading.has(version)) read(version);
            }
            // A failed file being asked for again still counts as answered.
            if (!range.every((version) => reads.has(version))) {
                if (snapshot?.to !== target || snapshot.from !== installed) publish(undefined);
                return;
            }
        }
        const files = new Map<string, ReleaseNotesFile>();
        for (const version of range) {
            const known = reads.get(version);
            if (known?.kind === "read") files.set(version, known.file);
        }
        publish(releaseNotesProject({ files, from: installed, range, to: target }));
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                unsubscribe = input.daemon.subscribe(reconcile);
                reconcile();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                unsubscribe?.();
                unsubscribe = undefined;
            };
        },
    };
}
