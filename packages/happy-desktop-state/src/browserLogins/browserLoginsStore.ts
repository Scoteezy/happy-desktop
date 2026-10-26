/**
 * The saved-login list for the workspace browser: which sites this machine has
 * a sign-in stored for, and under what account name. It holds only that
 * identity metadata — the site and the account — never the secret behind it.
 * The secret lives in the desktop process, kept by the operating system's
 * keychain, and never enters this package or any snapshot the UI reads.
 *
 * The list is desktop-local product state, not server state: the settings
 * surface renders one snapshot of it, and the desktop process that actually
 * keeps the secrets feeds the same snapshot in through a private writer. A
 * public action expresses the reader's intent — remove this login — and emits
 * a typed output the desktop process acts on; it never fabricates the saved
 * state itself.
 *
 * Following the state principles, the constructor opens nothing, the snapshot
 * is immutable, and updates are synchronous.
 *
 * Part of the browser-import work described in `master-plans/11-browser-import.md`.
 * Cookie encryption is enabled in the desktop package. The desktop main modules
 * `browserLoginVault`, `browserPasswords`, and `browserPasswordGuest` own the
 * encrypted vault, selected-site CSV import, native reveal, and guarded browser
 * save/autofill. `browserImport` and its main-only profile/database/crypto modules
 * import chosen browser sessions into one network and chosen passwords into the
 * shared vault; its separate surface store contains selection metadata only.
 * The thin renderer source feeds this list through
 * `BrowserLoginsWriter.loginsReceived` and acts on `BrowserLoginsOutput`.
 * `browserPasswordSettingsStore` holds only the import-selection metadata and
 * action status for settings; neither store receives credential values.
 */

declare const browserLoginIdBrand: unique symbol;

/** Identifies one saved login for its whole life, assigned by the desktop process. */
export type BrowserLoginId = string & { readonly [browserLoginIdBrand]: true };

export interface BrowserLoginSnapshot {
    readonly id: BrowserLoginId;
    /** The exact origin the login belongs to, e.g. `https://example.com`. */
    readonly origin: string;
    /** The account name stored for that origin. */
    readonly username: string;
    /** When the secret was last written, epoch milliseconds. */
    readonly updatedAt: number;
}

export interface BrowserLoginsSnapshot {
    /** Every saved login, keyed by its stable id. */
    readonly logins: ReadonlyMap<BrowserLoginId, BrowserLoginSnapshot>;
}

/**
 * What a public intent action tells the login's owner to do. The desktop
 * process is the owner: it holds the secret and is the only thing that can
 * forget it. Removing the metadata here without telling it would leave an
 * orphaned secret in the keychain, so the intent is emitted rather than acted
 * on locally, and the list reconciles when the owner writes back through
 * `loginsReceived`.
 */
export interface BrowserLoginsOutput {
    /** The reader asked to forget this saved login. */
    loginRemoveRequested(id: BrowserLoginId): void;
}

export interface BrowserLoginsStore {
    get(): BrowserLoginsSnapshot;
    subscribe(listener: () => void): () => void;
    /** Intent: forget this login. The owner removes the secret and writes the list back. */
    loginRemove(id: BrowserLoginId): void;
    [Symbol.dispose](): void;
}

export interface BrowserLoginsStoreOptions {
    /**
     * Where intents go. Absent, they go nowhere, so the same concrete store
     * works standalone in Blueprint and tests.
     */
    readonly output?: Partial<BrowserLoginsOutput>;
    /** Initial list, for restored or fixture state. Empty when absent. */
    readonly logins?: Iterable<BrowserLoginSnapshot>;
}

const EMPTY_SNAPSHOT: BrowserLoginsSnapshot = { logins: new Map() };

function snapshotOf(
    entries: Iterable<BrowserLoginSnapshot>,
    previous?: BrowserLoginsSnapshot,
): BrowserLoginsSnapshot {
    const logins = new Map<BrowserLoginId, BrowserLoginSnapshot>();
    // Ordered by origin, then account, so the list reads the same on every
    // launch regardless of the order the owner reports its entries in.
    const sorted = [...entries].sort(
        (a, b) => a.origin.localeCompare(b.origin) || a.username.localeCompare(b.username),
    );
    for (const entry of sorted) {
        const existing = previous?.logins.get(entry.id);
        logins.set(
            entry.id,
            existing &&
                existing.origin === entry.origin &&
                existing.username === entry.username &&
                existing.updatedAt === entry.updatedAt
                ? existing
                : {
                      id: entry.id,
                      origin: entry.origin,
                      username: entry.username,
                      updatedAt: entry.updatedAt,
                  },
        );
    }
    if (
        previous &&
        previous.logins.size === logins.size &&
        [...logins].every(([id, entry]) => previous.logins.get(id) === entry)
    )
        return previous;
    return { logins };
}

/**
 * The authoritative input to the store. Server, persistence, and reconciliation
 * enter here and must never re-emit the store's own output events: a login the
 * owner writes back is not a fresh intent to forget one.
 */
export interface BrowserLoginsWriter {
    /** Replace the whole list with what the desktop process now holds. */
    loginsReceived(entries: Iterable<BrowserLoginSnapshot>): void;
}

export interface BrowserLoginsStoreOwned {
    readonly store: BrowserLoginsStore;
    readonly writer: BrowserLoginsWriter;
}

/** Creates a saved-login list. Public creator for app, Blueprint, and tests. */
export function browserLoginsStoreCreate(
    options: BrowserLoginsStoreOptions = {},
): BrowserLoginsStore {
    return browserLoginsStoreOwnedCreate(options).store;
}

/**
 * Creates the store together with its private writer. The owner keeps the
 * writer to itself and hands only the store to the UI, so authoritative input
 * and public intent stay separate.
 */
export function browserLoginsStoreOwnedCreate(
    options: BrowserLoginsStoreOptions = {},
): BrowserLoginsStoreOwned {
    const listeners = new Set<() => void>();
    const output = options.output ?? {};
    let snapshot: BrowserLoginsSnapshot = options.logins
        ? snapshotOf(options.logins)
        : EMPTY_SNAPSHOT;
    let disposed = false;

    const notify = (): void => {
        for (const listener of listeners) listener();
    };

    const store: BrowserLoginsStore = {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        loginRemove(id) {
            if (disposed || !snapshot.logins.has(id)) return;
            // Intent only: the owner removes the secret and writes the list
            // back through `loginsReceived`. The local snapshot does not drop
            // the entry here, so the list never claims a login is gone before
            // its secret is.
            output.loginRemoveRequested?.(id);
        },
        [Symbol.dispose]() {
            disposed = true;
            listeners.clear();
        },
    };

    const writer: BrowserLoginsWriter = {
        loginsReceived(entries) {
            if (disposed) return;
            const next = snapshotOf(entries, snapshot);
            if (next === snapshot) return;
            snapshot = next;
            notify();
        },
    };

    return { store, writer };
}
