import { randomUUID } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { basename, dirname } from "node:path";
import { getDomain } from "tldts";
import {
    ipcMain,
    type BrowserWindow,
    type IpcMainInvokeEvent,
    type Session,
    type WebContents,
} from "electron";
import type {
    BrowserImportCapability,
    BrowserImportCatalog,
    BrowserImportCookieDomainId,
    BrowserImportCookieDomainSnapshot,
    BrowserImportEvent,
    BrowserImportLoginId,
    BrowserImportLoginSnapshot,
    BrowserImportProfileId,
    BrowserImportProfileSnapshot,
    BrowserImportProgress,
    BrowserImportProposal,
    BrowserImportProposalId,
    BrowserImportResult,
    BrowserImportSelection,
    BrowserImportSiteId,
    BrowserImportSiteSnapshot,
    BrowserLoginSnapshot,
} from "happy-desktop-state";
import { desktopIpc } from "../shared/desktopContract";
import { browserImportProfilesDiscover, type BrowserImportProfile } from "./browserImportProfiles";
import {
    browserImportCookieMetadataRead,
    browserImportCookiesRead,
    browserImportPasswordMetadataRead,
    browserImportPasswordsRead,
    type BrowserImportCookieMetadata,
    type BrowserImportCookieRecord,
    type BrowserImportPasswordRecord,
} from "./browserImportDatabase";
import {
    browserImportChromiumDecryptorCreate,
    browserImportFirefoxDecryptorCreate,
    BrowserImportAppBoundError,
    BrowserImportCryptoCancelledError,
    BrowserImportFirefoxPrimaryPasswordRequiredError,
    type BrowserImportChromiumDecryptor,
    type BrowserImportFirefoxDecryptor,
} from "./browserImportCrypto";
import { browserImportSecurePrompt } from "./browserImportSecurePrompt";
import type { BrowserLoginSecretInput, BrowserLoginVault } from "./browserLoginVault";

/**
 * Every workspace-browser profile on this computer. Imported sessions go to
 * all of them; listing may ask Happy Agent, the liveness check stays synchronous.
 */
export interface BrowserImportTargetSource {
    list(): Promise<readonly BrowserImportNetworkTarget[]>;
    current(target: BrowserImportNetworkTarget): boolean;
}

export interface BrowserImportNetworkTarget {
    readonly partition: string;
    readonly session: Session;
}

interface OwnedProfile {
    readonly metadata: BrowserImportProfileSnapshot;
    readonly source: BrowserImportProfile;
    readonly fingerprint: string;
}

interface OwnedSite {
    readonly metadata: BrowserImportSiteSnapshot;
    /** Keyed by the source cookie domain behind each opaque cookie-domain ID. */
    readonly cookieDomains: ReadonlyMap<string, BrowserImportCookieDomainSnapshot>;
    readonly origins: ReadonlySet<string>;
    /** Keyed by `loginKey`, the source identity behind each opaque login ID. */
    readonly logins: ReadonlyMap<string, BrowserImportLoginSnapshot>;
}

/** One selectable account: Chromium names it; Firefox keeps the name encrypted. */
function loginKey(origin: string, username: string | undefined): string {
    return JSON.stringify([origin, username ?? null]);
}

interface OwnedProposal {
    readonly metadata: BrowserImportProposal;
    readonly profile: OwnedProfile;
    readonly sites: ReadonlyMap<BrowserImportSiteId, OwnedSite>;
}

interface ImportSurface {
    readonly window: BrowserWindow;
    readonly owner: WebContents;
    readonly ownerListenersDispose: () => void;
    selectedProfileId?: BrowserImportProfileId;
    proposal?: OwnedProposal;
    expiry?: ReturnType<typeof setTimeout>;
    catalogTimer?: ReturnType<typeof setInterval>;
    changeTimer?: ReturnType<typeof setTimeout>;
    watchers: FSWatcher[];
    committing: boolean;
    catalogReading: boolean;
    catalogPending?: Promise<BrowserImportCatalog>;
    proposalReading: boolean;
    proposalDirty: boolean;
    proposalRevision: number;
    catalogFingerprint: string;
    cancelCommit?: () => void;
}

/** Native source paths, encrypted records, and plaintext never leave this owner. */
export class BrowserImportController {
    private readonly profiles = new Map<BrowserImportProfileId, OwnedProfile>();
    private readonly profileIds = new Map<string, BrowserImportProfileId>();
    private surface?: ImportSurface;

    constructor(
        private readonly options: {
            readonly windowRequire: (event: IpcMainInvokeEvent) => BrowserWindow;
            readonly windowCurrent: () => BrowserWindow | undefined;
            readonly targets: BrowserImportTargetSource;
            readonly vault: BrowserLoginVault;
            readonly loginsChanged: (entries: readonly BrowserLoginSnapshot[]) => void;
            /**
             * Whether this build's cookie store is encrypted at rest. When it is
             * not, sessions are never imported; the vault encrypts passwords itself.
             */
            readonly cookieStoreEncrypted: boolean;
        },
    ) {}

    install(): void {
        ipcMain.handle(desktopIpc.browserImportOpen, async (event) => {
            const window = this.options.windowRequire(event);
            if (process.platform !== "darwin" && process.platform !== "win32")
                throw new Error("Browser import is available on macOS and Windows.");
            if (this.surface?.committing) throw new Error("A browser import is already running.");
            this.close();
            const owner = window.webContents;
            const destroyed = () => this.close(surface);
            const navigated = (
                details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
            ) => {
                if (details.isMainFrame && !details.isSameDocument) this.close(surface);
            };
            const surface: ImportSurface = {
                window,
                owner,
                ownerListenersDispose: () => {
                    owner.removeListener("destroyed", destroyed);
                    owner.removeListener("did-start-navigation", navigated);
                },
                watchers: [],
                committing: false,
                catalogReading: false,
                proposalReading: false,
                proposalDirty: false,
                proposalRevision: 0,
                catalogFingerprint: "",
            };
            this.surface = surface;
            owner.on("destroyed", destroyed);
            owner.on("did-start-navigation", navigated);
            try {
                const catalog = await this.catalogRead(surface);
                this.currentRequire(surface);
                surface.catalogFingerprint = JSON.stringify(catalog);
                // This secondary native chooser has no directory-wide realtime
                // transport. Poll discovery only while open; selected sites use fs.watch.
                surface.catalogTimer = setInterval(() => {
                    if (
                        this.current(surface) &&
                        surface.window.isVisible() &&
                        !surface.committing &&
                        !surface.catalogReading
                    )
                        void this.catalogRead(surface)
                            .then((next) => {
                                this.catalogPublish(surface, next);
                                this.proposalRefresh(surface);
                            })
                            .catch(() => undefined);
                }, 3000);
                surface.catalogTimer.unref();
                return catalog;
            } catch {
                if (this.surface === surface) this.close();
                throw new Error(
                    "Browser profiles could not be listed. Check access to the source browser.",
                );
            }
        });
        ipcMain.handle(desktopIpc.browserImportProfileSelect, async (event, rawId: unknown) => {
            const window = this.options.windowRequire(event);
            const surface = this.surfaceRequire(window);
            if (
                surface.committing ||
                typeof rawId !== "string" ||
                !this.profiles.has(rawId as BrowserImportProfileId)
            )
                throw new Error("Choose an available browser profile.");
            const profile = this.profiles.get(rawId as BrowserImportProfileId)!;
            surface.selectedProfileId = profile.metadata.id;
            surface.proposal = undefined;
            clearTimeout(surface.expiry);
            this.watchersClear(surface);
            return this.proposalRead(surface, profile, false);
        });
        ipcMain.handle(desktopIpc.browserImportCommit, (event, raw: unknown) => {
            const window = this.options.windowRequire(event);
            const surface = this.surfaceRequire(window);
            return this.commit(surface, selectionRequire(raw)).catch((error: unknown) => {
                if (
                    error instanceof BrowserImportInteractionError ||
                    error instanceof BrowserImportSelectionError
                )
                    this.send(surface, { type: "sourceFailed", message: error.message });
                throw error;
            });
        });
        ipcMain.handle(desktopIpc.browserImportClose, (event) => {
            const window = this.options.windowRequire(event);
            if (this.surface && this.surface.window !== window)
                throw new Error("This import belongs to another window.");
            if (this.surface?.committing)
                throw new Error("The selected browser import is still running.");
            this.close();
        });
    }

    targetsChanged(): void {
        const surface = this.surface;
        if (surface && this.current(surface))
            void this.catalogSnapshot().then(
                (catalog) => this.catalogPublish(surface, catalog),
                () => undefined,
            );
    }

    dispose(): void {
        this.close();
        for (const channel of [
            desktopIpc.browserImportOpen,
            desktopIpc.browserImportProfileSelect,
            desktopIpc.browserImportCommit,
            desktopIpc.browserImportClose,
        ])
            ipcMain.removeHandler(channel);
    }

    private current(surface: ImportSurface): boolean {
        return (
            this.surface === surface &&
            this.options.windowCurrent() === surface.window &&
            !surface.window.isDestroyed() &&
            !surface.owner.isDestroyed()
        );
    }

    private currentRequire(surface: ImportSurface): void {
        if (!this.current(surface)) throw new Error("This browser import is no longer open.");
    }

    private surfaceRequire(window: BrowserWindow): ImportSurface {
        if (!this.surface || this.surface.window !== window || !this.current(this.surface))
            throw new Error("Open the browser import chooser first.");
        return this.surface;
    }

    private send(surface: ImportSurface, event: BrowserImportEvent): void {
        if (this.current(surface)) surface.owner.send(desktopIpc.browserImportChanged, event);
    }

    private catalogRead(surface: ImportSurface): Promise<BrowserImportCatalog> {
        if (surface.catalogPending) return surface.catalogPending;
        const pending = this.catalogLoad(surface);
        surface.catalogPending = pending;
        return pending;
    }

    private async catalogLoad(surface: ImportSurface): Promise<BrowserImportCatalog> {
        surface.catalogReading = true;
        try {
            const discovered = await browserImportProfilesDiscover();
            this.currentRequire(surface);
            const next = new Map<BrowserImportProfileId, OwnedProfile>();
            const keys = new Set<string>();
            for (const source of discovered) {
                const key = JSON.stringify([source.browser, source.directory]);
                keys.add(key);
                let id = this.profileIds.get(key);
                if (!id) {
                    id = randomUUID() as BrowserImportProfileId;
                    this.profileIds.set(key, id);
                }
                const metadata: BrowserImportProfileSnapshot = {
                    id,
                    browser: source.browser,
                    label: source.label,
                    profileName: source.profileName,
                    cookies: !this.options.cookieStoreEncrypted
                        ? { kind: "unavailable", reason: cookieStorePlaintextReason }
                        : source.unsupportedCookiesReason
                          ? { kind: "unavailable", reason: source.unsupportedCookiesReason }
                          : source.cookiesPath
                            ? { kind: "available" }
                            : {
                                  kind: "unavailable",
                                  reason: "This profile has no cookie database.",
                              },
                    passwords: passwordCapability(source),
                };
                next.set(id, { metadata, source, fingerprint: JSON.stringify(source) });
            }
            this.profiles.clear();
            for (const [id, profile] of next) this.profiles.set(id, profile);
            for (const key of this.profileIds.keys())
                if (!keys.has(key)) this.profileIds.delete(key);
            const proposal = surface.proposal;
            if (
                proposal &&
                this.profiles.get(proposal.profile.metadata.id)?.fingerprint !==
                    proposal.profile.fingerprint
            )
                this.proposalInvalidate(surface, proposal.metadata.id);
            if (surface.selectedProfileId && !this.profiles.has(surface.selectedProfileId)) {
                surface.selectedProfileId = undefined;
                surface.proposalRevision++;
            }
            return await this.catalogSnapshot();
        } finally {
            surface.catalogReading = false;
            surface.catalogPending = undefined;
        }
    }

    private catalogPublish(surface: ImportSurface, catalog: BrowserImportCatalog): void {
        if (!this.current(surface)) return;
        const fingerprint = JSON.stringify(catalog);
        if (fingerprint === surface.catalogFingerprint) return;
        surface.catalogFingerprint = fingerprint;
        this.send(surface, { type: "catalogReceived", catalog });
    }

    private async catalogSnapshot(): Promise<BrowserImportCatalog> {
        const targets = await this.options.targets.list();
        return {
            profiles: [...this.profiles.values()].map((profile) => profile.metadata),
            networkCount: targets.length,
        };
    }

    private async proposalRead(
        surface: ImportSurface,
        profile: OwnedProfile,
        refresh: boolean,
    ): Promise<BrowserImportProposal> {
        const previous = refresh ? surface.proposal : undefined;
        if (refresh && (!previous || Date.now() >= previous.metadata.expiresAt)) {
            if (previous) this.proposalInvalidate(surface, previous.metadata.id);
            throw new Error("This import selection expired.");
        }
        const revision = ++surface.proposalRevision;
        const id = previous?.metadata.id ?? (randomUUID() as BrowserImportProposalId);
        // A proposal holds metadata only. Choosing among hundreds of sites takes
        // a while, so it outlives a long selection; secrets are read at commit.
        const expiresAt = previous?.metadata.expiresAt ?? Date.now() + 30 * 60_000;
        const previousSites = new Map(
            previous
                ? [...previous.sites.values()].map((site) => [site.metadata.domain, site])
                : [],
        );
        const siteByDomain = new Map<
            string,
            {
                id: BrowserImportSiteId;
                domain: string;
                cookieCount: number;
                passwordCount: number;
                origins: Set<string>;
                usernames: Set<string>;
                domains: Map<string, number>;
                logins: Map<string, { origin: string; username?: string; count: number }>;
                previousCookieDomains?: ReadonlyMap<string, BrowserImportCookieDomainSnapshot>;
                previousLogins?: ReadonlyMap<string, BrowserImportLoginSnapshot>;
            }
        >();
        const notices: string[] = [];
        const siteGet = (host: string) => {
            const domain = getDomain(host, { allowPrivateDomains: true }) ?? host;
            let site = siteByDomain.get(domain);
            if (!site) {
                const old = previousSites.get(domain);
                site = {
                    id: old?.metadata.id ?? (randomUUID() as BrowserImportSiteId),
                    domain,
                    cookieCount: 0,
                    passwordCount: 0,
                    origins: new Set(),
                    usernames: new Set(),
                    domains: new Map(),
                    logins: new Map(),
                    previousCookieDomains: old?.cookieDomains,
                    previousLogins: old?.logins,
                };
                siteByDomain.set(domain, site);
            }
            return site;
        };
        surface.proposalReading = true;
        try {
            if (profile.metadata.cookies.kind === "available") {
                try {
                    const cookies = await browserImportCookieMetadataRead(profile.source);
                    for (const cookie of cookies) {
                        if (!cookieEligible(cookie)) continue;
                        const site = siteGet(cookie.domain);
                        site.cookieCount += 1;
                        site.domains.set(cookie.domain, (site.domains.get(cookie.domain) ?? 0) + 1);
                    }
                } catch {
                    notices.push(
                        profile.source.browser === "safari"
                            ? "Safari cookies require Full Disk Access for Happy in macOS Privacy & Security. Grant access and reopen this chooser."
                            : "Cookies could not be read. Close the source browser if it has locked its database, then reopen this chooser.",
                    );
                }
            } else notices.push(profile.metadata.cookies.reason);
            if (profile.metadata.passwords.kind === "available") {
                try {
                    const passwords = await browserImportPasswordMetadataRead(profile.source);
                    for (const login of passwords) {
                        if (ownDomain(new URL(login.origin).hostname)) continue;
                        const site = siteGet(new URL(login.origin).hostname);
                        site.passwordCount += 1;
                        site.origins.add(login.origin);
                        if (login.username !== undefined) site.usernames.add(login.username);
                        const key = loginKey(login.origin, login.username);
                        const entry = site.logins.get(key);
                        if (entry) entry.count += 1;
                        else
                            site.logins.set(key, {
                                origin: login.origin,
                                ...(login.username === undefined
                                    ? {}
                                    : { username: login.username }),
                                count: 1,
                            });
                    }
                } catch {
                    // Chromium opens its logins database with an exclusive lock,
                    // so it is unreadable whenever the browser is running.
                    notices.push(
                        `Saved logins could not be read. ${profile.source.label} locks them while it is open: quit ${profile.source.label}, then reopen this chooser.`,
                    );
                }
            } else notices.push(profile.metadata.passwords.reason);
            if (profile.source.engine === "firefox")
                notices.push(
                    "Firefox account names stay encrypted until you select their sites and unlock Firefox.",
                );
            if (profile.source.engine !== "safari")
                notices.push(
                    "Partitioned cookies and Firefox contextual identities stay in their original browser and are not imported.",
                );
            this.currentRequire(surface);
            if (
                surface.selectedProfileId !== profile.metadata.id ||
                surface.committing ||
                surface.proposalRevision !== revision ||
                Date.now() >= expiresAt ||
                (refresh && surface.proposal !== previous) ||
                this.profiles.get(profile.metadata.id)?.fingerprint !== profile.fingerprint
            )
                throw new Error("The source browser selection changed.");
            const sites = new Map<BrowserImportSiteId, OwnedSite>();
            for (const site of [...siteByDomain.values()].sort((a, b) =>
                a.domain.localeCompare(b.domain),
            )) {
                const logins = new Map<string, BrowserImportLoginSnapshot>();
                for (const [key, login] of [...site.logins].sort(([, left], [, right]) =>
                    left.origin === right.origin
                        ? (left.username ?? "").localeCompare(right.username ?? "")
                        : left.origin.localeCompare(right.origin),
                ))
                    logins.set(key, {
                        id:
                            site.previousLogins?.get(key)?.id ??
                            (randomUUID() as BrowserImportLoginId),
                        origin: login.origin,
                        ...(login.username === undefined ? {} : { username: login.username }),
                        passwordCount: login.count,
                    });
                // `.google.com` sorts beside `google.com`, ahead of its subdomains.
                const cookieDomains = new Map<string, BrowserImportCookieDomainSnapshot>();
                for (const [domain, count] of [...site.domains].sort(([left], [right]) => {
                    const bare = left.replace(/^\./, "").localeCompare(right.replace(/^\./, ""));
                    return bare || left.localeCompare(right);
                }))
                    cookieDomains.set(domain, {
                        id:
                            site.previousCookieDomains?.get(domain)?.id ??
                            (randomUUID() as BrowserImportCookieDomainId),
                        domain,
                        cookieCount: count,
                    });
                const metadata: BrowserImportSiteSnapshot = {
                    id: site.id,
                    domain: site.domain,
                    cookieCount: site.cookieCount,
                    cookieDomains: [...cookieDomains.values()],
                    passwordCount: site.passwordCount,
                    origins: [...site.origins].sort(),
                    usernames: [...site.usernames].sort(),
                    logins: [...logins.values()],
                };
                sites.set(site.id, {
                    metadata,
                    cookieDomains,
                    origins: site.origins,
                    logins,
                });
            }
            const metadata: BrowserImportProposal = {
                id,
                profileId: profile.metadata.id,
                sites: [...sites.values()].map((site) => site.metadata),
                notices,
                expiresAt,
            };
            surface.proposal = { metadata, profile, sites };
            if (!refresh) this.proposalResourcesInstall(surface, surface.proposal);
            return metadata;
        } finally {
            if (surface.proposalRevision === revision) surface.proposalReading = false;
        }
    }

    private proposalInvalidate(surface: ImportSurface, id: BrowserImportProposalId): void {
        if (surface.proposal?.metadata.id !== id) return;
        surface.proposal = undefined;
        surface.proposalRevision++;
        surface.proposalReading = false;
        clearTimeout(surface.expiry);
        this.watchersClear(surface);
        this.send(surface, { type: "proposalExpired", id });
    }

    private proposalResourcesInstall(surface: ImportSurface, proposal: OwnedProposal): void {
        clearTimeout(surface.expiry);
        const remaining = proposal.metadata.expiresAt - Date.now();
        if (remaining <= 0) {
            this.proposalInvalidate(surface, proposal.metadata.id);
            return;
        }
        surface.expiry = setTimeout(() => {
            if (this.current(surface) && !surface.committing)
                this.proposalInvalidate(surface, proposal.metadata.id);
        }, remaining);
        surface.expiry.unref();
        this.watchersInstall(surface, proposal.profile);
        // Catch changes between the metadata snapshot and watcher installation.
        surface.proposalDirty = true;
    }

    private proposalRefresh(surface: ImportSurface): void {
        if (
            !this.current(surface) ||
            !surface.window.isVisible() ||
            surface.committing ||
            surface.proposalReading ||
            !surface.proposal ||
            !surface.proposalDirty
        )
            return;
        const profile = surface.proposal.profile;
        surface.proposalDirty = false;
        void this.proposalRead(surface, profile, true)
            .then((proposal) => {
                this.send(surface, { type: "proposalReceived", proposal });
            })
            .catch(() => undefined);
    }

    private watchersInstall(surface: ImportSurface, profile: OwnedProfile): void {
        this.watchersClear(surface);
        const sources = [profile.source.cookiesPath, ...profile.source.loginsPaths].filter(
            (path): path is string => path !== undefined,
        );
        const paths = new Set(sources.map((path) => dirname(path)));
        // A browser writes its profile directory constantly (history, caches,
        // preferences). Only the imported databases and their journals change
        // the proposal; anything else would re-read it for nothing.
        const names = sources.map((path) => basename(path));
        const relevant = (file: string | Buffer | null) =>
            file === null || names.some((name) => String(file).startsWith(name));
        for (const path of paths) {
            try {
                const watcher = watch(path, (_event, file) => {
                    if (!relevant(file)) return;
                    if (!this.current(surface) || surface.committing) return;
                    // Retain invalidation while hidden or while a snapshot is being
                    // read. The visible chooser's catalog tick retries it later.
                    surface.proposalDirty = true;
                    if (!surface.window.isVisible()) return;
                    clearTimeout(surface.changeTimer);
                    surface.changeTimer = setTimeout(() => {
                        if (surface.selectedProfileId === profile.metadata.id)
                            this.proposalRefresh(surface);
                    }, 300);
                    surface.changeTimer.unref();
                });
                watcher.on("error", () => undefined);
                surface.watchers.push(watcher);
            } catch {
                /* Source errors are already explicit in the proposal notices. */
            }
        }
    }

    private watchersClear(surface: ImportSurface): void {
        clearTimeout(surface.changeTimer);
        for (const watcher of surface.watchers) watcher.close();
        surface.watchers = [];
    }

    private async commit(
        surface: ImportSurface,
        selection: BrowserImportSelection,
    ): Promise<BrowserImportResult> {
        const proposal = surface.proposal;
        this.interactiveRequire(surface);
        if (
            surface.committing ||
            !proposal ||
            proposal.metadata.id !== selection.proposalId ||
            Date.now() >= proposal.metadata.expiresAt
        )
            throw new BrowserImportSelectionError(
                "This selection expired. Choose the source profile again.",
            );
        const cookieDomains = selectedCookieDomainsRequire(proposal, selection.cookieDomainIds);
        const passwordLogins = selectedLoginsRequire(proposal, selection.passwordLoginIds);
        if (cookieDomains.length + passwordLogins.length === 0)
            throw new BrowserImportSelectionError("Choose the sites to import first.");
        if (cookieDomains.length && !this.options.cookieStoreEncrypted)
            throw new BrowserImportSelectionError(cookieStorePlaintextReason);
        const domains = new Set(cookieDomains.map((entry) => entry.domain));
        const origins = new Set(passwordLogins.map((login) => login.origin));
        const loginKeys = new Set(
            passwordLogins.map((login) => loginKey(login.origin, login.username)),
        );
        const selected = [...new Set([...domains, ...origins])];
        surface.committing = true;
        surface.proposalRevision++;
        surface.proposalReading = false;
        this.watchersClear(surface);
        clearTimeout(surface.expiry);
        let chromium: BrowserImportChromiumDecryptor | undefined;
        let firefox: BrowserImportFirefoxDecryptor | undefined;
        surface.cancelCommit = () => {
            chromium?.dispose();
            firefox?.dispose();
        };
        let targets: readonly BrowserImportNetworkTarget[] = [];
        let cookieRecords: readonly BrowserImportCookieRecord[] = [];
        let passwordRecords: readonly BrowserImportPasswordRecord[] = [];
        const plaintext: Buffer[] = [];
        const credentials: BrowserLoginSecretInput[] = [];
        const cookies: { metadata: BrowserImportCookieMetadata; value: string }[] = [];
        let bytes = 0;
        let finished = false;
        let cookiesProcessed = 0;
        const progress = (
            phase: BrowserImportProgress["phase"],
            completed: number,
            total: number,
        ) =>
            this.send(surface, {
                type: "progressReceived",
                progress: { proposalId: proposal.metadata.id, phase, completed, total },
            });
        const charge = (count: number) => {
            bytes += count;
            if (bytes > 32 * 1024 * 1024)
                throw new BrowserImportLimitError(
                    "The selected browser data exceeds the import limit. Import fewer sites at a time.",
                );
        };
        const decode = (buffer: Buffer) => {
            charge(buffer.length);
            const value = utf8Require(buffer);
            charge(value.length * 2);
            return value;
        };
        const retain = (buffer: Buffer) => {
            plaintext.push(buffer);
            return decode(buffer);
        };
        const result = {
            cookiesImported: 0,
            passwordsImported: 0,
            cookiesSkipped: 0,
            passwordsSkipped: 0,
            warnings: [] as string[],
        };
        try {
            this.catalogPublish(surface, await this.catalogRead(surface));
            this.commitRequire(surface, proposal);
            if (domains.size) {
                targets = await this.options.targets.list();
                this.commitRequire(surface, proposal);
                if (targets.length === 0)
                    throw new BrowserImportSelectionError(
                        "Open the built-in browser once, then import sessions into it.",
                    );
            }
            progress("decrypting", 0, 0);
            cookieRecords = domains.size
                ? await browserImportCookiesRead(proposal.profile.source, domains, cookieEligible)
                : [];
            // Origins bound the read; the chosen accounts then narrow it. A
            // Firefox record's account name is still encrypted, so its choice is
            // the whole origin, exactly as the proposal offered it.
            passwordRecords = (
                origins.size
                    ? await browserImportPasswordsRead(proposal.profile.source, origins)
                    : []
            ).filter((record) => {
                const chosen = loginKeys.has(
                    loginKey(
                        record.origin,
                        record.kind === "chromium" ? record.username : undefined,
                    ),
                );
                if (!chosen && record.kind === "chromium") record.encryptedPassword.fill(0);
                return chosen;
            });
            this.commitRequire(surface, proposal);
            if (cookieRecords.length + passwordRecords.length === 0) {
                this.proposalInvalidate(surface, proposal.metadata.id);
                throw new BrowserImportSelectionError(
                    "The selected browser data changed or was removed. Choose the source profile and its sites again.",
                );
            }
            result.cookiesSkipped += Math.max(
                0,
                cookieDomains.reduce((sum, entry) => sum + entry.cookieCount, 0) -
                    cookieRecords.length,
            );
            result.passwordsSkipped += Math.max(
                0,
                passwordLogins.reduce((sum, login) => sum + login.passwordCount, 0) -
                    passwordRecords.length,
            );
            if (result.cookiesSkipped || result.passwordsSkipped)
                result.warnings.push(
                    "Some selected records expired or were removed from the source browser before import and were skipped.",
                );
            // Include source plaintext values (Firefox/Safari/legacy Chromium),
            // ciphertext, and UTF-16 string storage in the selected-data budget.
            for (const record of cookieRecords) {
                charge(record.value.length * 2);
                if (record.kind === "chromium") charge(record.encryptedValue.length);
            }
            for (const record of passwordRecords) {
                if (record.kind === "chromium")
                    charge(record.encryptedPassword.length + record.username.length * 2);
                else
                    charge((record.encryptedUsername.length + record.encryptedPassword.length) * 2);
            }
            const source = proposal.profile.source;
            if (source.engine === "chromium") {
                if (source.browser === "firefox" || source.browser === "safari") throw new Error();
                chromium = await browserImportChromiumDecryptorCreate({
                    browser: source.browser,
                    selectedSites: selected,
                    localStatePath: source.localStatePath,
                });
            } else if (source.engine === "firefox" && passwordRecords.length > 0) {
                if (!source.nssLibraryPath)
                    throw new BrowserImportFirefoxPrimaryPasswordRequiredError();
                firefox = await browserImportFirefoxDecryptorCreate({
                    profilePath: source.directory,
                    nssLibraryPath: source.nssLibraryPath,
                    selectedSites: selected,
                    primaryPasswordRequest: async () => {
                        this.commitRequire(surface, proposal);
                        const buffer = await browserImportSecurePrompt(
                            surface.window,
                            "Unlock the selected Firefox passwords",
                        );
                        try {
                            this.commitRequire(surface, proposal);
                            return buffer;
                        } catch (error) {
                            buffer?.fill(0);
                            throw error;
                        }
                    },
                });
            }
            let completed = 0;
            const total = cookieRecords.length + passwordRecords.length;
            for (const record of cookieRecords) {
                this.commitRequire(surface, proposal);
                if (!cookieEligible(record)) {
                    result.cookiesSkipped++;
                    continue;
                }
                const value =
                    record.kind === "chromium"
                        ? retain(await chromium!.cookieDecrypt(record))
                        : record.value;
                this.commitRequire(surface, proposal);
                if (Buffer.byteLength(value) > 65_536) throw new Error();
                cookies.push({ metadata: record, value });
                if (++completed % 25 === 0) progress("decrypting", completed, total);
            }
            for (const record of passwordRecords) {
                this.commitRequire(surface, proposal);
                if (ownDomain(new URL(record.origin).hostname)) {
                    result.passwordsSkipped++;
                    continue;
                }
                let username: string;
                let password: string;
                if (record.kind === "chromium") {
                    username = record.username;
                    password = retain(await chromium!.passwordDecrypt(record));
                } else {
                    const login = await firefox!.loginDecrypt(record);
                    // Transfer both buffers before a decoding/limit error can
                    // interrupt ownership, so finally always scrubs both.
                    plaintext.push(login.username, login.password);
                    username = decode(login.username);
                    password = decode(login.password);
                }
                this.commitRequire(surface, proposal);
                if (!password || username.length > 4096 || password.length > 65_536) {
                    result.passwordsSkipped++;
                    continue;
                }
                credentials.push({ origin: record.origin, username, password });
                if (++completed % 25 === 0) progress("decrypting", completed, total);
            }
            progress("decrypting", total, total);
            this.catalogPublish(surface, await this.catalogRead(surface));
            this.commitRequire(surface, proposal);
            // Decrypt the chosen records before writing anything. A refused browser
            // unlock leaves both the destination cookies and vault untouched.
            if (credentials.length) {
                progress("passwords", 0, credentials.length);
                const metadata = await this.options.vault.loginsSave(credentials, () =>
                    this.commitRequire(surface, proposal),
                );
                result.passwordsImported = new Set(
                    credentials.map((entry) => JSON.stringify([entry.origin, entry.username])),
                ).size;
                this.options.loginsChanged(metadata);
                progress("passwords", credentials.length, credentials.length);
            }
            if (targets.length) {
                progress("cookies", 0, cookies.length);
                for (let index = 0; index < cookies.length; index++) {
                    this.commitRequire(surface, proposal);
                    const cookie = cookies[index];
                    if (!cookieEligible(cookie.metadata)) {
                        result.cookiesSkipped++;
                        cookiesProcessed++;
                        continue;
                    }
                    const host =
                        cookie.metadata.domain.includes(":") &&
                        !cookie.metadata.domain.startsWith("[")
                            ? `[${cookie.metadata.domain}]`
                            : cookie.metadata.domain;
                    // A profile whose workspace was archived meanwhile is skipped.
                    let written = false;
                    try {
                        for (const target of targets) {
                            if (!this.options.targets.current(target)) continue;
                            await target.session.cookies.set({
                                url: `https://${host}${cookie.metadata.path}`,
                                name: cookie.metadata.name,
                                value: cookie.value,
                                path: cookie.metadata.path,
                                ...(!cookie.metadata.hostOnly
                                    ? { domain: `.${cookie.metadata.domain}` }
                                    : {}),
                                secure: true,
                                httpOnly: cookie.metadata.httpOnly,
                                sameSite: cookie.metadata.sameSite,
                                ...(cookie.metadata.expires === null
                                    ? {}
                                    : { expirationDate: cookie.metadata.expires }),
                            });
                            written = true;
                        }
                    } catch {
                        written = false;
                    }
                    if (written) result.cookiesImported++;
                    else result.cookiesSkipped++;
                    cookiesProcessed++;
                    if ((index + 1) % 25 === 0) progress("cookies", index + 1, cookies.length);
                }
                const flushed = await Promise.all(
                    targets.map((target) =>
                        target.session.cookies.flushStore().then(
                            () => true,
                            () => false,
                        ),
                    ),
                );
                if (flushed.includes(false))
                    result.warnings.push(
                        "The imported cookies are available now, but could not be flushed to disk yet. Keep the built-in browser open so it can persist them.",
                    );
                progress("cookies", cookies.length, cookies.length);
                if (result.cookiesSkipped)
                    result.warnings.push(
                        "Some selected cookies expired or were rejected by the browser and were skipped.",
                    );
            }
            surface.proposal = undefined;
            finished = true;
            return result;
        } catch (error) {
            if (result.cookiesImported > 0 || result.passwordsImported > 0) {
                result.cookiesSkipped += Math.max(0, cookies.length - cookiesProcessed);
                result.warnings.push(
                    "The import stopped after saving some selected data. The reported passwords and cookies were imported; remaining cookies were skipped. Keep Happy open so its browser can finish persisting them.",
                );
                finished = true;
                surface.proposal = undefined;
                return result;
            }
            if (
                error instanceof BrowserImportAppBoundError ||
                error instanceof BrowserImportCryptoCancelledError ||
                error instanceof BrowserImportFirefoxPrimaryPasswordRequiredError ||
                error instanceof BrowserImportInteractionError ||
                error instanceof BrowserImportSelectionError ||
                error instanceof BrowserImportLimitError
            ) {
                this.send(surface, { type: "sourceFailed", message: error.message });
                throw error;
            }
            // Import errors are built from fixed text and never carry a value,
            // so the cause can be logged to diagnose an otherwise generic failure.
            console.error(
                "[browser-import] commit failed:",
                error instanceof Error
                    ? (error.stack ?? `${error.name}: ${error.message}`)
                    : typeof error,
            );
            const message =
                "The selected browser data could not be imported. Close the source browser if it has locked its database, and check access to its OS protection. No unselected sites were imported.";
            this.send(surface, { type: "sourceFailed", message });
            throw new Error(message);
        } finally {
            chromium?.dispose();
            firefox?.dispose();
            for (const buffer of plaintext) buffer.fill(0);
            for (const record of cookieRecords)
                if (record.kind === "chromium") record.encryptedValue.fill(0);
            for (const record of passwordRecords)
                if (record.kind === "chromium") record.encryptedPassword.fill(0);
            credentials.length = 0;
            cookies.length = 0;
            surface.cancelCommit = undefined;
            surface.committing = false;
            if (!this.current(surface)) this.close(surface);
            else if (!finished && surface.proposal === proposal) {
                try {
                    this.catalogPublish(surface, await this.catalogRead(surface));
                    if (
                        surface.proposal === proposal &&
                        surface.selectedProfileId === proposal.profile.metadata.id
                    )
                        this.proposalResourcesInstall(surface, proposal);
                } catch {
                    this.proposalInvalidate(surface, proposal.metadata.id);
                }
            }
        }
    }

    /** The person starts an import from Happy's focused window. */
    private interactiveRequire(surface: ImportSurface): void {
        if (!surface.window.isFocused())
            throw new BrowserImportInteractionError(
                "Keep Happy visible and focused while importing browser data. Hidden app sessions cannot unlock a browser.",
            );
        this.presenceRequire(surface);
    }

    /**
     * An import already started only needs Happy's window to stay open and
     * visible. It may not require focus: the Keychain's own password dialogs
     * take focus mid-import by design, and focus returns only after them.
     */
    private presenceRequire(surface: ImportSurface): void {
        if (
            !this.current(surface) ||
            !surface.window.isVisible() ||
            process.env.HAPPY_DESKTOP_WINDOWS_HIDDEN !== undefined ||
            process.env.HAPPY_DESKTOP_GYM_PROFILE !== undefined
        )
            throw new BrowserImportInteractionError(
                "Keep Happy open while importing browser data. Hidden app sessions cannot unlock a browser.",
            );
    }

    private commitRequire(surface: ImportSurface, proposal: OwnedProposal): void {
        this.presenceRequire(surface);
        if (
            surface.proposal !== proposal ||
            surface.selectedProfileId !== proposal.profile.metadata.id ||
            Date.now() >= proposal.metadata.expiresAt ||
            this.profiles.get(proposal.profile.metadata.id)?.fingerprint !==
                proposal.profile.fingerprint
        )
            throw new BrowserImportSelectionError(
                "The source profile changed or this selection expired. Choose its sites again.",
            );
    }

    private close(surface = this.surface): void {
        if (!surface || this.surface !== surface) return;
        this.surface = undefined;
        surface.proposalRevision++;
        surface.ownerListenersDispose();
        surface.cancelCommit?.();
        clearInterval(surface.catalogTimer);
        clearTimeout(surface.expiry);
        this.watchersClear(surface);
        surface.proposal = undefined;
        this.profiles.clear();
        this.profileIds.clear();
    }
}

class BrowserImportInteractionError extends Error {}
const cookieStorePlaintextReason =
    "Sessions are imported only in installed Happy, whose browser encrypts cookies on disk.";

class BrowserImportSelectionError extends Error {}
class BrowserImportLimitError extends Error {}

function passwordCapability(source: BrowserImportProfile): BrowserImportCapability {
    if (source.unsupportedPasswordsReason)
        return {
            kind:
                source.browser === "safari" ||
                (source.platform === "win32" && source.browser === "chrome")
                    ? "csv"
                    : "unavailable",
            reason: source.unsupportedPasswordsReason,
        };
    return source.loginsPaths.length
        ? { kind: "available" }
        : { kind: "unavailable", reason: "This profile has no saved login database." };
}

function ownDomain(host: string): boolean {
    const domain = host.toLowerCase().replace(/\.$/, "");
    return domain === "happy.engineering" || domain.endsWith(".happy.engineering");
}

/**
 * Registrable domains that carry a Google Account session: every Google country
 * domain and YouTube, which sets the same SID family for the same account.
 */
function googleAccountDomain(registered: string | null): boolean {
    if (!registered) return false;
    return (
        registered.startsWith("google.") ||
        registered.startsWith("youtube.") ||
        registered === "youtube-nocookie.com"
    );
}

/** The external-cookie boundary excludes Google's device-bound authentication. */
function googleSignInCookie(cookie: BrowserImportCookieMetadata): boolean {
    const registered = getDomain(cookie.domain, { allowPrivateDomains: true });
    const google = googleAccountDomain(registered);
    if (
        google &&
        (cookie.domain === `accounts.${registered}` ||
            cookie.domain.endsWith(`.accounts.${registered}`))
    )
        return true;
    return (
        google &&
        (googleAuthenticationCookieNames.has(cookie.name) ||
            /^__(?:Secure|Host)-(?:[13]P)?(?:SID|APISID|LSID|OSID|DBSC|PSID)/.test(cookie.name))
    );
}

const googleAuthenticationCookieNames = new Set([
    "SID",
    "SIDCC",
    "HSID",
    "SSID",
    "APISID",
    "SAPISID",
    "LSID",
    "OSID",
    "__Host-GAPS",
    // YouTube's marker for the same signed-in Google Account.
    "LOGIN_INFO",
]);

function cookieEligible(cookie: BrowserImportCookieMetadata): boolean {
    return (
        cookie.secure &&
        !ownDomain(cookie.domain) &&
        !googleSignInCookie(cookie) &&
        (cookie.expires === null || cookie.expires > Date.now() / 1000)
    );
}

function selectedCookieDomainsRequire(
    proposal: OwnedProposal,
    ids: readonly BrowserImportCookieDomainId[],
): BrowserImportCookieDomainSnapshot[] {
    const cookieDomains = new Map(
        [...proposal.sites.values()].flatMap((site) =>
            [...site.cookieDomains.values()].map((entry) => [entry.id, entry] as const),
        ),
    );
    if (ids.length > cookieDomains.size || new Set(ids).size !== ids.length)
        throw new BrowserImportSelectionError("This session selection is invalid.");
    return ids.map((id) => {
        const entry = cookieDomains.get(id);
        if (!entry)
            throw new BrowserImportSelectionError(
                "Choose only sessions listed by this browser profile.",
            );
        return entry;
    });
}

function selectedLoginsRequire(
    proposal: OwnedProposal,
    ids: readonly BrowserImportLoginId[],
): BrowserImportLoginSnapshot[] {
    const logins = new Map(
        [...proposal.sites.values()].flatMap((site) =>
            [...site.logins.values()].map((login) => [login.id, login] as const),
        ),
    );
    if (ids.length > logins.size || new Set(ids).size !== ids.length)
        throw new BrowserImportSelectionError("This login selection is invalid.");
    return ids.map((id) => {
        const login = logins.get(id);
        if (!login)
            throw new BrowserImportSelectionError(
                "Choose only logins listed by this browser profile.",
            );
        return login;
    });
}

function selectionRequire(raw: unknown): BrowserImportSelection {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("This browser import selection is invalid.");
    const candidate = raw as Partial<BrowserImportSelection>;
    if (
        typeof candidate.proposalId !== "string" ||
        !Array.isArray(candidate.cookieDomainIds) ||
        !Array.isArray(candidate.passwordLoginIds) ||
        candidate.cookieDomainIds.length > 100_000 ||
        candidate.passwordLoginIds.length > 20_000 ||
        !candidate.cookieDomainIds.every((id) => typeof id === "string") ||
        !candidate.passwordLoginIds.every((id) => typeof id === "string")
    )
        throw new Error("This browser import selection is invalid.");
    return {
        proposalId: candidate.proposalId,
        cookieDomainIds: [...candidate.cookieDomainIds] as BrowserImportCookieDomainId[],
        passwordLoginIds: [...candidate.passwordLoginIds] as BrowserImportLoginId[],
    };
}

function utf8Require(buffer: Buffer): string {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
}
