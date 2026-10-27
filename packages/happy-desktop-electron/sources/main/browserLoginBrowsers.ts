import type { BrowserWindow } from "electron";
import {
    browserLoginChromiumDecryptorCreate,
    browserLoginFirefoxDecryptorCreate,
    BrowserLoginCryptoCancelledError,
    BrowserLoginFirefoxPrimaryPasswordRequiredError,
    BrowserLoginKeyRefusedError,
    type BrowserLoginFirefoxDecryptor,
} from "./browserLoginCrypto";
import { browserLoginKeychainItemExists } from "./browserLoginKeychain";
import {
    browserLoginFingerprint,
    browserLoginMetadataRead,
    browserLoginRecordRead,
    type BrowserLoginMetadata,
} from "./browserLoginDatabase";
import { browserLoginProfilesDiscover, type BrowserLoginProfile } from "./browserLoginProfiles";
import { browserLoginSecurePrompt } from "./browserLoginSecurePrompt";
import {
    browserLoginRelation,
    BrowserLoginUseError,
    type BrowserLoginCandidate,
    type BrowserLoginSecret,
    type BrowserLoginSource,
    type BrowserLoginSourceList,
} from "./browserLoginSources";

interface ProfileLogins {
    readonly fingerprint: string;
    readonly logins: readonly BrowserLoginMetadata[];
}

/**
 * Saved logins of every Chromium-family and Firefox profile on this machine,
 * read where the browser keeps them. Login metadata is cached per profile and
 * reread only after its files change; a password is decrypted only inside
 * `use`, for the one login the person picked, and never kept.
 */
export class BrowserLoginBrowserSource implements BrowserLoginSource {
    private readonly cache = new Map<string, ProfileLogins>();
    /** Firefox account names decrypted for the picker, by file, record, and ciphertext. */
    private readonly firefoxUsernames = new Map<string, string>();
    /** NSS has process-global state, so Firefox reads run one at a time. */
    private firefoxQueue: Promise<unknown> = Promise.resolve();
    private readonly keys = new Map<string, { present: boolean; checkedAt: number }>();

    async list(pageOrigin: string): Promise<BrowserLoginSourceList> {
        const profiles: BrowserLoginProfile[] = [];
        for (const profile of await browserLoginProfilesDiscover())
            if (!profile.keychainService || (await this.keyPresent(profile.keychainService)))
                profiles.push(profile);
        const perBrowser = new Map<string, number>();
        for (const profile of profiles)
            perBrowser.set(profile.label, (perBrowser.get(profile.label) ?? 0) + 1);
        const candidates: BrowserLoginCandidate[] = [];
        const live = new Set<string>();
        for (const profile of profiles) {
            live.add(profile.directory);
            // The profile is named only when the browser has more than one.
            const source =
                (perBrowser.get(profile.label) ?? 0) > 1
                    ? `${profile.label} · ${profile.profileName}`
                    : profile.label;
            let logins: readonly BrowserLoginMetadata[];
            try {
                logins = await this.profileLogins(profile);
            } catch {
                // An unreadable profile simply offers nothing; a picker of
                // logins is no place for one browser's diagnostics.
                continue;
            }
            const matching = newest(
                logins.flatMap((login) => {
                    const relation = browserLoginRelation(pageOrigin, login.origin);
                    return relation ? [{ login, relation }] : [];
                }),
            );
            if (matching.length === 0) continue;
            const usernames =
                profile.engine === "firefox"
                    ? await this.firefoxUsernamesRead(
                          profile,
                          matching.map((entry) => entry.login),
                      )
                    : undefined;
            for (const { login, relation } of matching) {
                const username = login.username ?? usernames?.get(login);
                candidates.push({
                    origin: login.origin,
                    relation,
                    name: username || "Saved login",
                    nameIsUsername: username !== undefined,
                    source,
                    use: (field, window, deliver) =>
                        this.use(profile, login, username, field, window, deliver),
                });
            }
        }
        for (const directory of this.cache.keys())
            if (!live.has(directory)) this.cache.delete(directory);
        return { candidates };
    }

    /** Whether a browser's key exists, rechecked at most once a minute. */
    private async keyPresent(service: string): Promise<boolean> {
        const cached = this.keys.get(service);
        if (cached && Date.now() - cached.checkedAt < 60_000) return cached.present;
        const present = await browserLoginKeychainItemExists(service);
        this.keys.set(service, { present, checkedAt: Date.now() });
        return present;
    }

    private async profileLogins(
        profile: BrowserLoginProfile,
    ): Promise<readonly BrowserLoginMetadata[]> {
        const fingerprint = await browserLoginFingerprint(profile);
        const cached = this.cache.get(profile.directory);
        if (cached?.fingerprint === fingerprint) return cached.logins;
        const logins = await browserLoginMetadataRead(profile);
        this.cache.set(profile.directory, { fingerprint, logins });
        return logins;
    }

    /**
     * Firefox encrypts account names too. Those of the logins offered here are
     * decrypted with Firefox's own library when no primary password locks it;
     * a locked profile lists its logins without names until one is picked.
     */
    private async firefoxUsernamesRead(
        profile: BrowserLoginProfile,
        logins: readonly BrowserLoginMetadata[],
    ): Promise<ReadonlyMap<BrowserLoginMetadata, string>> {
        const names = new Map<BrowserLoginMetadata, string>();
        const missing = logins.filter((login) => {
            const name = this.firefoxUsernames.get(firefoxKey(login));
            if (name !== undefined) names.set(login, name);
            return name === undefined && login.firefox;
        });
        if (missing.length === 0 || !profile.nssLibraryPath) return names;
        await this.firefoxRun(async () => {
            let decryptor: BrowserLoginFirefoxDecryptor | undefined;
            try {
                decryptor = await browserLoginFirefoxDecryptorCreate({
                    profilePath: profile.directory,
                    nssLibraryPath: profile.nssLibraryPath!,
                    selectedSites: [...new Set(missing.map((login) => login.origin))],
                });
                for (const login of missing) {
                    const bytes = await decryptor.usernameDecrypt({
                        origin: login.origin,
                        encryptedUsername: login.firefox!.encryptedUsername,
                    });
                    try {
                        const name = utf8Require(bytes);
                        this.firefoxUsernames.set(firefoxKey(login), name);
                        names.set(login, name);
                    } finally {
                        bytes.fill(0);
                    }
                }
            } catch (error) {
                if (!(error instanceof BrowserLoginFirefoxPrimaryPasswordRequiredError))
                    throw error;
            } finally {
                decryptor?.dispose();
            }
        }).catch(() => undefined);
        return names;
    }

    private async use(
        profile: BrowserLoginProfile,
        login: BrowserLoginMetadata,
        username: string | undefined,
        field: "username" | "password",
        window: BrowserWindow,
        deliver: (login: BrowserLoginSecret) => Promise<void>,
    ): Promise<void> {
        try {
            await this.useUnchecked(profile, login, username, field, window, deliver);
        } catch (error) {
            if (
                error instanceof BrowserLoginUseError ||
                error instanceof BrowserLoginCryptoCancelledError
            )
                throw error;
            throw new BrowserLoginUseError(
                error instanceof BrowserLoginKeyRefusedError
                    ? `The Keychain did not unlock ${profile.label}'s saved logins.`
                    : `This login could not be read from ${profile.label}.`,
            );
        }
    }

    private async useUnchecked(
        profile: BrowserLoginProfile,
        login: BrowserLoginMetadata,
        username: string | undefined,
        field: "username" | "password",
        window: BrowserWindow,
        deliver: (login: BrowserLoginSecret) => Promise<void>,
    ): Promise<void> {
        // The first step of a two-step sign-in needs only the account name,
        // which the browser keeps unencrypted: nothing is unlocked.
        if (field === "username" && username !== undefined) {
            await deliver({ username, password: null });
            return;
        }
        const record = await browserLoginRecordRead(login);
        if (!record)
            throw new BrowserLoginUseError(`This login is no longer saved in ${profile.label}.`);
        if (record.kind === "chromium") {
            if (profile.engine !== "chromium") throw new Error("This saved login is invalid.");
            const decryptor = await browserLoginChromiumDecryptorCreate({
                keychainService: profile.keychainService,
                selectedSites: [record.origin],
                localStatePath: profile.localStatePath,
            });
            let plaintext: Buffer | undefined;
            try {
                plaintext = await decryptor.passwordDecrypt(record);
                await deliver({ username: record.username, password: utf8Require(plaintext) });
            } finally {
                plaintext?.fill(0);
                record.encryptedPassword.fill(0);
                decryptor.dispose();
            }
            return;
        }
        await this.firefoxRun(async () => {
            const decryptor = await browserLoginFirefoxDecryptorCreate({
                profilePath: profile.directory,
                nssLibraryPath: profile.nssLibraryPath!,
                selectedSites: [record.origin],
                primaryPasswordRequest: () =>
                    browserLoginSecurePrompt(window, `Firefox · ${profile.profileName}`),
            });
            let secret: { username: Buffer; password: Buffer } | undefined;
            try {
                secret = await decryptor.loginDecrypt(record);
                await deliver({
                    username: utf8Require(secret.username),
                    password: field === "password" ? utf8Require(secret.password) : null,
                });
            } finally {
                secret?.username.fill(0);
                secret?.password.fill(0);
                decryptor.dispose();
            }
        });
    }

    private firefoxRun<T>(run: () => Promise<T>): Promise<T> {
        const next = this.firefoxQueue.then(run, run);
        this.firefoxQueue = next.catch(() => undefined);
        return next;
    }
}

/** One login per account and origin in a profile: the most recently changed. */
function newest<T extends { readonly login: BrowserLoginMetadata }>(
    entries: readonly T[],
): readonly T[] {
    const byAccount = new Map<string, T>();
    for (const entry of entries) {
        // A Firefox account name is unknown here, so its record ID stands in.
        const key = JSON.stringify([
            entry.login.origin,
            entry.login.username ?? entry.login.firefox?.guid,
        ]);
        const previous = byAccount.get(key);
        if (!previous || previous.login.updatedAt < entry.login.updatedAt)
            byAccount.set(key, entry);
    }
    return [...byAccount.values()];
}

function firefoxKey(login: BrowserLoginMetadata): string {
    return JSON.stringify([login.path, login.firefox?.guid, login.firefox?.encryptedUsername]);
}

function utf8Require(buffer: Buffer): string {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
}
