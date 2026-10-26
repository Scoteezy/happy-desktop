import type { BrowserLoginId } from "./browserLoginsStore.js";

declare const importIdBrand: unique symbol;
export type BrowserPasswordImportId = string & { readonly [importIdBrand]: true };

/** Metadata only. CSV contents and credential values remain in desktop main. */
export interface BrowserPasswordImportSite {
    readonly origin: string;
    readonly usernames: readonly string[];
    readonly count: number;
}

export interface BrowserPasswordImportProposal {
    readonly id: BrowserPasswordImportId;
    readonly sites: readonly BrowserPasswordImportSite[];
    readonly skipped: number;
    readonly expiresAt: number;
}

export interface BrowserPasswordSettingsSnapshot {
    readonly available: boolean;
    readonly loading: boolean;
    readonly pending: boolean;
    readonly error?: string;
    readonly proposal?: BrowserPasswordImportProposal;
    readonly selectedOrigins: ReadonlySet<string>;
}

export interface BrowserPasswordSettingsOutput {
    importChooseRequested(): void;
    importCommitRequested(id: BrowserPasswordImportId, origins: readonly string[]): void;
    importCancelRequested(id: BrowserPasswordImportId): void;
    loginRevealRequested(id: BrowserLoginId): void;
}

export interface BrowserPasswordSettingsStore {
    get(): BrowserPasswordSettingsSnapshot;
    subscribe(listener: () => void): () => void;
    importChoose(): void;
    importSiteSelect(origin: string, selected: boolean): void;
    importCommit(): void;
    importCancel(): void;
    loginReveal(id: BrowserLoginId): void;
    [Symbol.dispose](): void;
}

export interface BrowserPasswordSettingsWriter {
    loginsLoaded(): void;
    operationFailed(message: string): void;
    operationFinished(): void;
    loginRemoveFailed(message: string): void;
    importProposed(proposal: BrowserPasswordImportProposal | null): void;
    importCommitted(): void;
    importExpired(id: BrowserPasswordImportId): void;
}

export function browserPasswordSettingsStoreOwnedCreate(
    options: {
        readonly available?: boolean;
        readonly output?: Partial<BrowserPasswordSettingsOutput>;
    } = {},
): {
    readonly store: BrowserPasswordSettingsStore;
    readonly writer: BrowserPasswordSettingsWriter;
} {
    const output = options.output ?? {};
    let snapshot: BrowserPasswordSettingsSnapshot = {
        available: options.available ?? false,
        loading: options.available ?? false,
        pending: false,
        selectedOrigins: new Set(),
    };
    let disposed = false;
    const listeners = new Set<() => void>();
    const set = (next: BrowserPasswordSettingsSnapshot) => {
        if (disposed) return;
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const ready = () => !disposed && snapshot.available && !snapshot.loading && !snapshot.pending;
    const start = () => set({ ...snapshot, error: undefined, pending: true });
    const store: BrowserPasswordSettingsStore = {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        importChoose() {
            if (!ready() || snapshot.proposal) return;
            start();
            output.importChooseRequested?.();
        },
        importSiteSelect(origin, selected) {
            if (!ready() || !snapshot.proposal?.sites.some((site) => site.origin === origin))
                return;
            const selectedOrigins = new Set(snapshot.selectedOrigins);
            if (selected) selectedOrigins.add(origin);
            else selectedOrigins.delete(origin);
            set({ ...snapshot, selectedOrigins });
        },
        importCommit() {
            if (!ready() || !snapshot.proposal || snapshot.selectedOrigins.size === 0) return;
            const { id } = snapshot.proposal;
            const origins = [...snapshot.selectedOrigins];
            start();
            output.importCommitRequested?.(id, origins);
        },
        importCancel() {
            if (disposed || snapshot.pending || !snapshot.proposal) return;
            const { id } = snapshot.proposal;
            set({ ...snapshot, proposal: undefined, selectedOrigins: new Set(), error: undefined });
            output.importCancelRequested?.(id);
        },
        loginReveal(id) {
            if (!ready()) return;
            start();
            output.loginRevealRequested?.(id);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            if (snapshot.proposal) output.importCancelRequested?.(snapshot.proposal.id);
            disposed = true;
            listeners.clear();
        },
    };
    const writer: BrowserPasswordSettingsWriter = {
        loginsLoaded: () => set({ ...snapshot, loading: false }),
        operationFailed: (error) => set({ ...snapshot, loading: false, pending: false, error }),
        operationFinished: () => set({ ...snapshot, pending: false, error: undefined }),
        loginRemoveFailed: (error) => set({ ...snapshot, error }),
        importProposed: (proposal) =>
            set({
                ...snapshot,
                proposal: proposal ?? undefined,
                selectedOrigins: new Set(),
                pending: false,
                error: undefined,
            }),
        importCommitted: () =>
            set({
                ...snapshot,
                proposal: undefined,
                selectedOrigins: new Set(),
                pending: false,
                error: undefined,
            }),
        importExpired(id) {
            if (snapshot.proposal?.id !== id) return;
            set({
                ...snapshot,
                proposal: undefined,
                selectedOrigins: new Set(),
                pending: false,
                error: "The password import expired. Choose the CSV again.",
            });
        },
    };
    return { store, writer };
}
