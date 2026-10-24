import {
    applySpaceSidebarOperations,
    diffSpaceSidebar,
    formatSpaceSidebar,
    HappyAgentApiError,
    parseSpaceSidebar,
    type HappyAgentClient,
    type HappyAgentEvent,
    type SpaceSidebarDocument,
    type SpaceSidebarOperation,
    type SpaceSidebarProposal,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";

/** Where a proposal stands: open to edit and answer, or answered. */
export type HappyAgentSidebarProposalStatus = "open" | "accepted" | "declined";

/** One proposal as the chat shows it: its latest document with the person's edits on top. */
export interface HappyAgentSidebarProposal {
    readonly artifactId: string;
    /** The proposal artifact's latest version; version 1 is the sidebar it was drafted from. */
    readonly version: number;
    readonly status: HappyAgentSidebarProposalStatus;
    /** The proposed sidebar, in the sidebar's own grammar. */
    readonly html: string;
    /** An answer is on its way. */
    readonly answering?: "accept" | "decline";
    /** Why the person's last edit or answer was refused, until the next one. */
    readonly error?: UserError;
}

export type HappyAgentSidebarProposalEntry =
    | { readonly type: "loading" }
    /** Gone, another person's, or from a daemon without proposals. */
    | { readonly type: "missing" }
    | { readonly type: "ready"; readonly proposal: HappyAgentSidebarProposal };

/** Every proposal a chat on screen asked for, by artifact ID. */
export type HappyAgentSidebarProposalsSnapshot = ReadonlyMap<
    string,
    HappyAgentSidebarProposalEntry
>;

/**
 * The person's sidebar proposals, as Prioritizing's chat shows them inline.
 * Each is read once when a chat asks for it, then kept current from
 * `space.sidebar.proposal.changed`; a reconnect reads every one again.
 *
 * The person's edits show at once and stay exactly where they are when the
 * daemon confirms them: the screen is the daemon's latest version with the
 * unconfirmed edits applied on top, by the same function the daemon applies
 * them with. A refusal takes only that edit back off.
 */
export interface HappyAgentSidebarProposalsStore {
    get(): HappyAgentSidebarProposalsSnapshot;
    subscribe(listener: () => void): () => void;
    /** Owner input: the proposals a chat shows. Starts reads; never publishes in this call. */
    proposalsRequest(artifactIds: readonly string[]): void;
    /** The person edited an open proposal into `html`: a move, fold, or rename. */
    proposalEdit(artifactId: string, html: string): void;
    /** Takes the proposal: the sidebar becomes it, as the person's own change. */
    proposalAccept(artifactId: string): void;
    /** Keeps the person's own sidebar. */
    proposalDecline(artifactId: string): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentSidebarProposalsDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "getSpaceSidebarProposal"
        | "applySpaceSidebarProposalOperations"
        | "acceptSpaceSidebarProposal"
        | "declineSpaceSidebarProposal"
    >;
    readonly sync: HappyAgentSync;
    readonly now?: () => number;
}

const PROPOSAL_EVENT_TYPES = [
    "space.sidebar.proposal.changed",
] as const satisfies readonly HappyAgentEvent["type"][];

/** What the daemon last said of one proposal, and the person's edits not confirmed yet. */
interface Held {
    readonly proposal: SpaceSidebarProposal;
    readonly html: string;
    readonly edits: readonly {
        readonly mutationId: string;
        readonly operations: readonly SpaceSidebarOperation[];
        readonly base: SpaceSidebarDocument;
    }[];
    readonly answering?: "accept" | "decline";
    readonly error?: UserError;
}

export function happyAgentSidebarProposalsStoreCreate(
    deps: HappyAgentSidebarProposalsDeps,
): HappyAgentSidebarProposalsStore {
    const idCreate = cuid2Create(deps.now ?? Date.now);
    const listeners = new Set<() => void>();
    const wanted = new Set<string>();
    const reading = new Set<string>();
    const held = new Map<string, Held>();
    let snapshot: HappyAgentSidebarProposalsSnapshot = new Map();
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    /** Edits of one proposal go one at a time, each against the version the last produced. */
    const queues = new Map<string, Promise<void>>();

    const entrySet = (artifactId: string, entry: HappyAgentSidebarProposalEntry): void => {
        const next = new Map(snapshot);
        next.set(artifactId, entry);
        snapshot = next;
        for (const listener of [...listeners]) listener();
    };
    /** The held document with every unconfirmed edit on top. */
    const shownHtml = (entry: Held): string => {
        if (entry.edits.length === 0) return entry.html;
        let document: SpaceSidebarDocument;
        try {
            document = parseSpaceSidebar(entry.html);
        } catch {
            return entry.html;
        }
        for (const edit of entry.edits) {
            try {
                document = applySpaceSidebarOperations(document, edit.operations, {
                    base: edit.base,
                }).document;
            } catch {
                // Already in the held version, or no longer possible: the
                // daemon's answer for it decides, and it draws nothing now.
            }
        }
        return formatSpaceSidebar(document);
    };
    const show = (artifactId: string): void => {
        const entry = held.get(artifactId);
        if (entry === undefined) return;
        entrySet(artifactId, {
            type: "ready",
            proposal: {
                artifactId,
                version: entry.proposal.version,
                status: entry.proposal.status,
                html: shownHtml(entry),
                ...(entry.answering ? { answering: entry.answering } : {}),
                ...(entry.error ? { error: entry.error } : {}),
            },
        });
    };
    const heldUpdate = (artifactId: string, change: (entry: Held) => Held): void => {
        const entry = held.get(artifactId);
        if (entry === undefined) return;
        held.set(artifactId, change(entry));
        show(artifactId);
    };

    const proposalRead = (artifactId: string, signal: AbortSignal): void => {
        if (reading.has(artifactId)) return;
        reading.add(artifactId);
        if (!snapshot.has(artifactId)) entrySet(artifactId, { type: "loading" });
        void deps.client
            .getSpaceSidebarProposal(artifactId, { signal })
            .then((answer) => {
                if (disposed || signal.aborted) return;
                const current = held.get(artifactId);
                // A version this window already holds, its own edit included, stands.
                if (current && current.proposal.version > answer.proposal.version) return;
                held.set(artifactId, {
                    proposal: answer.proposal,
                    html: answer.html,
                    edits: current?.edits ?? [],
                    ...(current?.answering ? { answering: current.answering } : {}),
                });
                show(artifactId);
            })
            .catch((error: unknown) => {
                if (disposed || signal.aborted) return;
                if (error instanceof HappyAgentApiError && error.status === 404)
                    entrySet(artifactId, { type: "missing" });
            })
            .finally(() => reading.delete(artifactId));
    };

    const eventApply = (
        event: Extract<HappyAgentEvent, { type: "space.sidebar.proposal.changed" }>,
        signal: AbortSignal,
    ): void => {
        const payload = event.payload;
        const artifactId = payload.proposal.artifactId;
        if (!wanted.has(artifactId)) return;
        const entry = held.get(artifactId);
        // A proposal still being read is answered by that read.
        if (entry === undefined) return;
        if (payload.proposal.version < entry.proposal.version) return;
        if (payload.operations.length === 0) {
            // A new status: the document is the one held.
            held.set(artifactId, { ...entry, proposal: payload.proposal });
            show(artifactId);
            return;
        }
        if (payload.proposal.version === entry.proposal.version) return;
        // A version that follows the one held is replayed onto it; a gap is read whole.
        if (payload.previousVersion !== entry.proposal.version) {
            proposalRead(artifactId, signal);
            return;
        }
        let html: string;
        try {
            html = formatSpaceSidebar(
                applySpaceSidebarOperations(parseSpaceSidebar(entry.html), payload.operations)
                    .document,
            );
        } catch {
            proposalRead(artifactId, signal);
            return;
        }
        held.set(artifactId, {
            ...entry,
            proposal: payload.proposal,
            html,
            // The person's own edit, confirmed: it is already on screen.
            edits:
                payload.mutationId === undefined
                    ? entry.edits
                    : entry.edits.filter((edit) => edit.mutationId !== payload.mutationId),
        });
        show(artifactId);
    };

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        const active = new AbortController();
        following = active;
        let failed = false;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [...PROPOSAL_EVENT_TYPES],
            })) {
                if (input.kind === "error") {
                    failed = true;
                    continue;
                }
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    (input.kind === "update" && input.update.kind === "connected" && failed)
                ) {
                    failed = false;
                    for (const artifactId of wanted) proposalRead(artifactId, active.signal);
                    continue;
                }
                if (input.kind !== "update" || input.update.kind !== "event") continue;
                const event = input.update.event;
                if (event.type === "space.sidebar.proposal.changed")
                    eventApply(event, active.signal);
            }
        })()
            .catch(() => undefined)
            .finally(() => {
                if (following === active) following = undefined;
                if (!active.signal.aborted && !disposed && listeners.size > 0)
                    retry = setTimeout(start, 1_000);
            });
    };
    const stop = (): void => {
        following?.abort();
        following = undefined;
        reading.clear();
        if (retry) clearTimeout(retry);
        retry = undefined;
    };

    /** Runs one request for a proposal after the ones before it, under one mutation ID. */
    const enqueue = (artifactId: string, work: () => Promise<void>): void => {
        const queue = (queues.get(artifactId) ?? Promise.resolve()).then(work, work);
        queues.set(artifactId, queue);
    };
    /** Retries a request that was not heard, under the same mutation ID; a refusal is final. */
    const attempt = async <Answer>(act: () => Promise<Answer>): Promise<Answer> => {
        for (let tries = 0; ; tries += 1) {
            try {
                return await act();
            } catch (error) {
                if (
                    tries >= 2 ||
                    disposed ||
                    (error instanceof HappyAgentApiError && error.status < 500)
                )
                    throw error;
                await new Promise((resolve) => setTimeout(resolve, 400 * (tries + 1)));
            }
        }
    };
    const refused = (artifactId: string, error: unknown): void => {
        heldUpdate(artifactId, (entry) => {
            const { answering: _answering, ...rest } = entry;
            return { ...rest, error: happyAgentUserError(error) };
        });
        // The daemon moved on from the version held: read where it stands.
        if (following) proposalRead(artifactId, following.signal);
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            start();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        proposalsRequest(artifactIds) {
            if (disposed) return;
            for (const artifactId of artifactIds) {
                if (wanted.has(artifactId)) continue;
                wanted.add(artifactId);
                const active = following;
                // Read after this call, so a surface may ask while it renders.
                if (active) queueMicrotask(() => proposalRead(artifactId, active.signal));
            }
        },
        proposalEdit(artifactId, html) {
            const entry = held.get(artifactId);
            if (entry === undefined || entry.proposal.status !== "open" || entry.answering) return;
            let base: SpaceSidebarDocument;
            let proposed: SpaceSidebarDocument;
            try {
                base = parseSpaceSidebar(shownHtml(entry));
                proposed = parseSpaceSidebar(html);
            } catch {
                return;
            }
            const operations = diffSpaceSidebar(base, proposed);
            if (operations.length === 0) return;
            const edit = { mutationId: idCreate(), operations, base };
            // A new edit puts the last refusal behind it.
            const { error: _error, ...rest } = entry;
            held.set(artifactId, { ...rest, edits: [...entry.edits, edit] });
            show(artifactId);
            enqueue(artifactId, async () => {
                if (disposed) return;
                try {
                    const answer = await attempt(() =>
                        deps.client.applySpaceSidebarProposalOperations(artifactId, {
                            mutationId: edit.mutationId,
                            baseVersion: held.get(artifactId)?.proposal.version ?? 1,
                            operations: [...edit.operations],
                        }),
                    );
                    if (disposed) return;
                    heldUpdate(artifactId, (current) => ({
                        ...current,
                        edits: current.edits.filter((candidate) => candidate !== edit),
                        ...(answer.version > current.proposal.version
                            ? {
                                  proposal: { ...current.proposal, version: answer.version },
                                  html: answer.html,
                              }
                            : {}),
                    }));
                } catch (error) {
                    if (disposed) return;
                    held.set(artifactId, {
                        ...held.get(artifactId)!,
                        edits: held
                            .get(artifactId)!
                            .edits.filter((candidate) => candidate !== edit),
                    });
                    refused(artifactId, error);
                }
            });
        },
        proposalAccept(artifactId) {
            const entry = held.get(artifactId);
            if (entry === undefined || entry.proposal.status !== "open" || entry.answering) return;
            const mutationId = idCreate();
            heldUpdate(artifactId, (current) => ({ ...current, answering: "accept" }));
            // Accepting waits for the edits before it, so it takes them too.
            enqueue(artifactId, async () => {
                if (disposed) return;
                try {
                    const answer = await attempt(() =>
                        deps.client.acceptSpaceSidebarProposal(artifactId, { mutationId }),
                    );
                    if (disposed) return;
                    heldUpdate(artifactId, (current) => {
                        const { answering: _answering, ...rest } = current;
                        return { ...rest, proposal: answer.proposal };
                    });
                } catch (error) {
                    refused(artifactId, error);
                }
            });
        },
        proposalDecline(artifactId) {
            const entry = held.get(artifactId);
            if (entry === undefined || entry.proposal.status !== "open" || entry.answering) return;
            const mutationId = idCreate();
            heldUpdate(artifactId, (current) => ({ ...current, answering: "decline" }));
            enqueue(artifactId, async () => {
                if (disposed) return;
                try {
                    const answer = await attempt(() =>
                        deps.client.declineSpaceSidebarProposal(artifactId, { mutationId }),
                    );
                    if (disposed) return;
                    heldUpdate(artifactId, (current) => {
                        const { answering: _answering, ...rest } = current;
                        return { ...rest, proposal: answer.proposal };
                    });
                } catch (error) {
                    refused(artifactId, error);
                }
            });
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}

const NOOP_SNAPSHOT: HappyAgentSidebarProposalsSnapshot = new Map();

/** A proposals store with nothing behind it, for a Happy Agent without proposals. */
export const happyAgentSidebarProposalsStoreNoop: HappyAgentSidebarProposalsStore = {
    get: () => NOOP_SNAPSHOT,
    subscribe: () => () => undefined,
    proposalsRequest: () => undefined,
    proposalEdit: () => undefined,
    proposalAccept: () => undefined,
    proposalDecline: () => undefined,
    [Symbol.dispose]: () => undefined,
};
