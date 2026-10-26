import type {
    BrowserImportCatalog,
    BrowserImportCapability,
    BrowserImportCookieDomainId,
    BrowserImportCookieDomainSnapshot,
    BrowserImportLoginId,
    BrowserImportLoginSnapshot,
    BrowserImportProfileId,
    BrowserImportProgress,
    BrowserImportProposal,
    BrowserImportProposalId,
    BrowserImportResult,
    BrowserImportSelection,
    BrowserImportSiteId,
} from "./browserImportTypes.js";

/** Native import metadata and local intent; credential values never enter this store. */
export interface BrowserImportSnapshot {
    readonly open: boolean;
    readonly loading: boolean;
    readonly pending: boolean;
    readonly error?: string;
    readonly catalog: BrowserImportCatalog;
    readonly profileId?: BrowserImportProfileId;
    readonly proposal?: BrowserImportProposal;
    readonly cookieDomainIds: ReadonlySet<BrowserImportCookieDomainId>;
    readonly passwordLoginIds: ReadonlySet<BrowserImportLoginId>;
    readonly progress?: BrowserImportProgress;
    readonly result?: BrowserImportResult;
}

export interface BrowserImportOutput {
    importOpenRequested(): void;
    importCloseRequested(): void;
    profileSelectRequested(id: BrowserImportProfileId): void;
    importCommitRequested(selection: BrowserImportSelection): void;
}

export interface BrowserImportStore {
    get(): BrowserImportSnapshot;
    subscribe(listener: () => void): () => void;
    importOpen(): void;
    importClose(): void;
    profileSelect(id: BrowserImportProfileId): void;
    /** Selects or clears every cookie domain of one site. */
    cookieSiteSelect(id: BrowserImportSiteId, selected: boolean): void;
    /** Selects or clears sessions for many sites at once, such as every search match. */
    cookieSitesSelect(ids: readonly BrowserImportSiteId[], selected: boolean): void;
    cookieDomainSelect(id: BrowserImportCookieDomainId, selected: boolean): void;
    /** Selects or clears every saved login of one site. */
    passwordSiteSelect(id: BrowserImportSiteId, selected: boolean): void;
    /** Selects or clears every saved login of many sites at once. */
    passwordSitesSelect(ids: readonly BrowserImportSiteId[], selected: boolean): void;
    passwordLoginSelect(id: BrowserImportLoginId, selected: boolean): void;
    importCommit(): void;
    [Symbol.dispose](): void;
}

/** Authoritative native input is kept private by the surface's owner. */
export interface BrowserImportWriter {
    importOpened(catalog: BrowserImportCatalog): void;
    catalogReceived(catalog: BrowserImportCatalog): void;
    proposalReceived(proposal: BrowserImportProposal): void;
    proposalExpired(id: BrowserImportProposalId): void;
    progressReceived(progress: BrowserImportProgress): void;
    sourceFailed(message: string): void;
    importFinished(result: BrowserImportResult): void;
    operationFailed(message: string): void;
}

export interface BrowserImportStoreOptions {
    readonly output?: Partial<BrowserImportOutput>;
}

const emptySnapshot = (): BrowserImportSnapshot => ({
    open: false,
    loading: false,
    pending: false,
    catalog: { profiles: [], networkCount: 0 },
    cookieDomainIds: new Set(),
    passwordLoginIds: new Set(),
});

function rowsRetain<T extends { readonly id: string }>(
    previous: readonly T[],
    incoming: readonly T[],
    equal: (left: T, right: T) => boolean,
): readonly T[] {
    const prior = new Map(previous.map((row) => [row.id, row]));
    const next = incoming.map((row) => {
        const existing = prior.get(row.id);
        return existing && equal(existing, row) ? existing : row;
    });
    return next.length === previous.length && next.every((row, index) => row === previous[index])
        ? previous
        : next;
}

const stringsEqual = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length && left.every((value, index) => value === right[index]);

const cookieDomainsEqual = (
    left: readonly BrowserImportCookieDomainSnapshot[],
    right: readonly BrowserImportCookieDomainSnapshot[],
) =>
    left.length === right.length &&
    left.every(
        (domain, index) =>
            domain.id === right[index]!.id &&
            domain.domain === right[index]!.domain &&
            domain.cookieCount === right[index]!.cookieCount,
    );

const loginsEqual = (
    left: readonly BrowserImportLoginSnapshot[],
    right: readonly BrowserImportLoginSnapshot[],
) =>
    left.length === right.length &&
    left.every(
        (login, index) =>
            login.id === right[index]!.id &&
            login.origin === right[index]!.origin &&
            login.username === right[index]!.username &&
            login.passwordCount === right[index]!.passwordCount,
    );

function capabilityEqual(left: BrowserImportCapability, right: BrowserImportCapability): boolean {
    if (left.kind === "available") return right.kind === "available";
    return left.kind === right.kind && left.reason === right.reason;
}

function catalogRetain(
    previous: BrowserImportCatalog,
    incoming: BrowserImportCatalog,
): BrowserImportCatalog {
    const profiles = rowsRetain(
        previous.profiles,
        incoming.profiles,
        (left, right) =>
            left.browser === right.browser &&
            left.label === right.label &&
            left.profileName === right.profileName &&
            capabilityEqual(left.cookies, right.cookies) &&
            capabilityEqual(left.passwords, right.passwords),
    );
    return profiles === previous.profiles && incoming.networkCount === previous.networkCount
        ? previous
        : { profiles, networkCount: incoming.networkCount };
}

function proposalRetain(
    previous: BrowserImportProposal | undefined,
    incoming: BrowserImportProposal,
): BrowserImportProposal {
    if (!previous || previous.id !== incoming.id) return incoming;
    const sites = rowsRetain(
        previous.sites,
        incoming.sites,
        (left, right) =>
            left.domain === right.domain &&
            left.cookieCount === right.cookieCount &&
            cookieDomainsEqual(left.cookieDomains, right.cookieDomains) &&
            left.passwordCount === right.passwordCount &&
            stringsEqual(left.origins, right.origins) &&
            stringsEqual(left.usernames, right.usernames) &&
            loginsEqual(left.logins, right.logins),
    );
    const notices = stringsEqual(previous.notices, incoming.notices)
        ? previous.notices
        : incoming.notices;
    return previous.profileId === incoming.profileId &&
        previous.expiresAt === incoming.expiresAt &&
        sites === previous.sites &&
        notices === previous.notices
        ? previous
        : { ...incoming, sites, notices };
}

function selectionIntersect<T extends string>(
    selected: ReadonlySet<T>,
    allowed: ReadonlySet<T>,
): ReadonlySet<T> {
    const retained = [...selected].filter((id) => allowed.has(id));
    return retained.length === selected.size ? selected : new Set(retained);
}

/** Resource-free standalone creator for application and Blueprint lifetimes. */
export function browserImportStoreCreate(
    options: BrowserImportStoreOptions = {},
): BrowserImportStore {
    return browserImportStoreOwnedCreate(options).store;
}

export function browserImportStoreOwnedCreate(options: BrowserImportStoreOptions = {}): {
    readonly store: BrowserImportStore;
    readonly writer: BrowserImportWriter;
} {
    const output = options.output ?? {};
    const listeners = new Set<() => void>();
    let snapshot = emptySnapshot();
    let disposed = false;
    const set = (next: BrowserImportSnapshot) => {
        if (disposed) return;
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const ready = () => !disposed && snapshot.open && !snapshot.loading && !snapshot.pending;
    const profile = () =>
        snapshot.catalog.profiles.find((entry) => entry.id === snapshot.profileId);
    const cookieDomainsSelect = (
        ids: readonly BrowserImportCookieDomainId[],
        selected: boolean,
    ) => {
        if (!ready() || !snapshot.proposal || profile()?.cookies.kind !== "available") return;
        const known = new Set(
            snapshot.proposal.sites.flatMap((site) =>
                site.cookieDomains.map((domain) => domain.id),
            ),
        );
        const next = new Set(snapshot.cookieDomainIds);
        for (const id of ids)
            if (known.has(id)) {
                if (selected) next.add(id);
                else next.delete(id);
            }
        if (
            next.size === snapshot.cookieDomainIds.size &&
            [...next].every((id) => snapshot.cookieDomainIds.has(id))
        )
            return;
        set({ ...snapshot, cookieDomainIds: next, error: undefined, result: undefined });
    };
    const siteCookieDomainIds = (ids: readonly BrowserImportSiteId[]) => {
        const wanted = new Set(ids);
        return (snapshot.proposal?.sites ?? [])
            .filter((site) => wanted.has(site.id))
            .flatMap((site) => site.cookieDomains.map((domain) => domain.id));
    };
    const passwordLoginsSelect = (ids: readonly BrowserImportLoginId[], selected: boolean) => {
        if (!ready() || !snapshot.proposal || profile()?.passwords.kind !== "available") return;
        const known = new Set(
            snapshot.proposal.sites.flatMap((site) => site.logins.map((login) => login.id)),
        );
        const next = new Set(snapshot.passwordLoginIds);
        for (const id of ids)
            if (known.has(id)) {
                if (selected) next.add(id);
                else next.delete(id);
            }
        if (
            next.size === snapshot.passwordLoginIds.size &&
            [...next].every((id) => snapshot.passwordLoginIds.has(id))
        )
            return;
        set({ ...snapshot, passwordLoginIds: next, error: undefined, result: undefined });
    };
    const siteLoginIds = (ids: readonly BrowserImportSiteId[]) => {
        const wanted = new Set(ids);
        return (snapshot.proposal?.sites ?? [])
            .filter((site) => wanted.has(site.id))
            .flatMap((site) => site.logins.map((login) => login.id));
    };
    const store: BrowserImportStore = {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => {};
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        importOpen() {
            if (disposed || snapshot.open) return;
            set({ ...emptySnapshot(), open: true, loading: true });
            output.importOpenRequested?.();
        },
        importClose() {
            if (disposed || !snapshot.open) return;
            // Visible controls refuse closing while pending. A surface owner
            // may still end its lifetime; the native owner finishes an already
            // authorized commit before releasing its resources.
            set(emptySnapshot());
            output.importCloseRequested?.();
        },
        profileSelect(id) {
            if (
                disposed ||
                !snapshot.open ||
                snapshot.pending ||
                !snapshot.catalog.profiles.some((entry) => entry.id === id)
            )
                return;
            if (snapshot.profileId === id && (snapshot.loading || snapshot.proposal)) return;
            set({
                ...snapshot,
                profileId: id,
                proposal: undefined,
                cookieDomainIds: new Set(),
                passwordLoginIds: new Set(),
                loading: true,
                error: undefined,
                result: undefined,
                progress: undefined,
            });
            output.profileSelectRequested?.(id);
        },
        cookieSiteSelect: (id, selected) =>
            cookieDomainsSelect(siteCookieDomainIds([id]), selected),
        cookieSitesSelect: (ids, selected) =>
            cookieDomainsSelect(siteCookieDomainIds(ids), selected),
        cookieDomainSelect: (id, selected) => cookieDomainsSelect([id], selected),
        passwordSiteSelect: (id, selected) => passwordLoginsSelect(siteLoginIds([id]), selected),
        passwordSitesSelect: (ids, selected) => passwordLoginsSelect(siteLoginIds(ids), selected),
        passwordLoginSelect: (id, selected) => passwordLoginsSelect([id], selected),
        importCommit() {
            if (!ready() || !snapshot.proposal) return;
            const cookieDomainIds = snapshot.proposal.sites.flatMap((site) =>
                site.cookieDomains
                    .filter((domain) => snapshot.cookieDomainIds.has(domain.id))
                    .map((domain) => domain.id),
            );
            const passwordLoginIds = snapshot.proposal.sites.flatMap((site) =>
                site.logins
                    .filter((login) => snapshot.passwordLoginIds.has(login.id))
                    .map((login) => login.id),
            );
            if (cookieDomainIds.length + passwordLoginIds.length === 0) return;
            if (cookieDomainIds.length > 0 && snapshot.catalog.networkCount === 0) return;
            const selection: BrowserImportSelection = {
                proposalId: snapshot.proposal.id,
                cookieDomainIds,
                passwordLoginIds,
            };
            set({
                ...snapshot,
                pending: true,
                error: undefined,
                progress: undefined,
                result: undefined,
            });
            output.importCommitRequested?.(selection);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            const wasOpen = snapshot.open;
            disposed = true;
            listeners.clear();
            if (wasOpen) output.importCloseRequested?.();
        },
    };
    const catalogReceived = (catalog: BrowserImportCatalog) => {
        if (disposed || !snapshot.open) return;
        const profileMissing =
            snapshot.profileId !== undefined &&
            !catalog.profiles.some((entry) => entry.id === snapshot.profileId);
        const currentProfile = catalog.profiles.find((entry) => entry.id === snapshot.profileId);
        set({
            ...snapshot,
            catalog: catalogRetain(snapshot.catalog, catalog),
            ...(!snapshot.pending
                ? {
                      cookieDomainIds:
                          currentProfile?.cookies.kind === "available"
                              ? snapshot.cookieDomainIds
                              : new Set<BrowserImportCookieDomainId>(),
                      passwordLoginIds:
                          currentProfile?.passwords.kind === "available"
                              ? snapshot.passwordLoginIds
                              : new Set<BrowserImportLoginId>(),
                  }
                : {}),
            ...(profileMissing && !snapshot.pending
                ? {
                      profileId: undefined,
                      proposal: undefined,
                      cookieDomainIds: new Set<BrowserImportCookieDomainId>(),
                      passwordLoginIds: new Set<BrowserImportLoginId>(),
                      loading: false,
                      error: "The selected browser profile is no longer available. Choose another profile.",
                  }
                : {}),
        });
    };
    const writer: BrowserImportWriter = {
        importOpened(catalog) {
            if (disposed || !snapshot.open) return;
            catalogReceived(catalog);
            if (snapshot.profileId === undefined) set({ ...snapshot, loading: false });
        },
        catalogReceived,
        proposalReceived(proposal) {
            if (
                disposed ||
                !snapshot.open ||
                proposal.profileId !== snapshot.profileId ||
                snapshot.pending
            )
                return;
            const sameProposal = proposal.id === snapshot.proposal?.id;
            set({
                ...snapshot,
                proposal: proposalRetain(snapshot.proposal, proposal),
                loading: false,
                error: sameProposal ? snapshot.error : undefined,
                cookieDomainIds: sameProposal
                    ? selectionIntersect(
                          snapshot.cookieDomainIds,
                          new Set(
                              proposal.sites.flatMap((site) =>
                                  site.cookieDomains.map((domain) => domain.id),
                              ),
                          ),
                      )
                    : new Set(),
                passwordLoginIds: sameProposal
                    ? selectionIntersect(
                          snapshot.passwordLoginIds,
                          new Set(
                              proposal.sites.flatMap((site) =>
                                  site.logins.map((login) => login.id),
                              ),
                          ),
                      )
                    : new Set(),
                progress: undefined,
                result: undefined,
            });
        },
        proposalExpired(id) {
            if (disposed || !snapshot.open || snapshot.proposal?.id !== id) return;
            set({
                ...snapshot,
                proposal: undefined,
                cookieDomainIds: new Set(),
                passwordLoginIds: new Set(),
                loading: false,
                error: "This import selection expired. Choose the browser profile again.",
            });
        },
        progressReceived(progress) {
            if (
                disposed ||
                !snapshot.open ||
                !snapshot.pending ||
                progress.proposalId !== snapshot.proposal?.id
            )
                return;
            set({ ...snapshot, progress });
        },
        sourceFailed(error) {
            if (disposed || !snapshot.open) return;
            set({ ...snapshot, loading: false, pending: false, progress: undefined, error });
        },
        importFinished(result) {
            if (disposed || !snapshot.open || !snapshot.pending) return;
            set({
                ...snapshot,
                pending: false,
                loading: false,
                proposal: undefined,
                cookieDomainIds: new Set(),
                passwordLoginIds: new Set(),
                progress: undefined,
                error: undefined,
                result,
            });
        },
        operationFailed(error) {
            if (disposed || !snapshot.open) return;
            set({ ...snapshot, loading: false, pending: false, progress: undefined, error });
        },
    };
    return { store, writer };
}
