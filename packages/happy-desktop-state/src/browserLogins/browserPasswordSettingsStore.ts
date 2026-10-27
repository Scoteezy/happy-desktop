/**
 * Saved-login settings: which 1Password account Happy reads logins from. Happy
 * stores no password, so there is no list of logins here, only this choice.
 */
export interface BrowserPasswordSettingsSnapshot {
    /** Whether this host reads saved logins at all (the macOS and Windows desktop app). */
    readonly available: boolean;
    readonly loading: boolean;
    readonly onePasswordInstalled: boolean;
    /** The connected 1Password account, or null when none is. */
    readonly onePasswordAccount: string | null;
    /** The account name being typed before connecting. */
    readonly onePasswordAccountDraft: string;
    readonly pending: boolean;
    readonly error?: string;
}

export interface BrowserPasswordSettingsReceived {
    readonly onePasswordInstalled: boolean;
    readonly onePasswordAccount: string | null;
}

export interface BrowserPasswordSettingsOutput {
    onePasswordConnectRequested(account: string): void;
    onePasswordDisconnectRequested(): void;
}

export interface BrowserPasswordSettingsStore {
    get(): BrowserPasswordSettingsSnapshot;
    subscribe(listener: () => void): () => void;
    onePasswordAccountDraftUpdate(value: string): void;
    onePasswordConnect(): void;
    onePasswordDisconnect(): void;
    [Symbol.dispose](): void;
}

export interface BrowserPasswordSettingsWriter {
    settingsReceived(settings: BrowserPasswordSettingsReceived): void;
    operationFailed(message: string): void;
}

export function browserPasswordSettingsStoreOwnedCreate(
    options: {
        readonly available?: boolean;
        readonly initial?: BrowserPasswordSettingsReceived;
        readonly output?: Partial<BrowserPasswordSettingsOutput>;
    } = {},
): {
    readonly store: BrowserPasswordSettingsStore;
    readonly writer: BrowserPasswordSettingsWriter;
} {
    const output = options.output ?? {};
    const available = options.available ?? false;
    let snapshot: BrowserPasswordSettingsSnapshot = {
        available,
        loading: available && options.initial === undefined,
        onePasswordInstalled: options.initial?.onePasswordInstalled ?? false,
        onePasswordAccount: options.initial?.onePasswordAccount ?? null,
        onePasswordAccountDraft: "",
        pending: false,
    };
    let disposed = false;
    const listeners = new Set<() => void>();
    const set = (next: BrowserPasswordSettingsSnapshot) => {
        if (disposed) return;
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const ready = () => !disposed && snapshot.available && !snapshot.loading && !snapshot.pending;
    const store: BrowserPasswordSettingsStore = {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        onePasswordAccountDraftUpdate(value) {
            if (disposed) return;
            set({ ...snapshot, onePasswordAccountDraft: value, error: undefined });
        },
        onePasswordConnect() {
            const account = snapshot.onePasswordAccountDraft.trim();
            if (!ready() || !snapshot.onePasswordInstalled || account === "") return;
            set({ ...snapshot, pending: true, error: undefined });
            output.onePasswordConnectRequested?.(account);
        },
        onePasswordDisconnect() {
            if (!ready() || snapshot.onePasswordAccount === null) return;
            set({ ...snapshot, pending: true, error: undefined });
            output.onePasswordDisconnectRequested?.();
        },
        [Symbol.dispose]() {
            disposed = true;
            listeners.clear();
        },
    };
    const writer: BrowserPasswordSettingsWriter = {
        settingsReceived: (settings) =>
            set({
                ...snapshot,
                ...settings,
                loading: false,
                pending: false,
                error: undefined,
                onePasswordAccountDraft:
                    settings.onePasswordAccount === null ? snapshot.onePasswordAccountDraft : "",
            }),
        operationFailed: (error) => set({ ...snapshot, loading: false, pending: false, error }),
    };
    return { store, writer };
}
