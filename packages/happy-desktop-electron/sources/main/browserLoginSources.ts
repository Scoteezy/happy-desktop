import type { BrowserWindow } from "electron";
import { getDomain } from "tldts";

/**
 * How a saved login relates to the page it is offered on: the same HTTPS
 * origin, or another origin of the same registrable domain (login.x.com for
 * x.com). Related logins are always labelled as such.
 */
export type BrowserLoginRelation = "exact" | "related";

/** What a picked login hands to the page. A username field never receives a password. */
export interface BrowserLoginSecret {
    readonly username: string;
    readonly password: string | null;
}

/**
 * One saved login offered for one page, read on demand from a browser or a
 * password manager. Only metadata is held; `use` decrypts this one record,
 * hands it to `deliver`, and keeps nothing.
 */
export interface BrowserLoginCandidate {
    /** The login's own HTTPS origin. */
    readonly origin: string;
    readonly relation: BrowserLoginRelation;
    /** The primary label: an account name, or the item title when that is all a source lists. */
    readonly name: string;
    /** Where the login comes from, such as "Chrome · Work" or "1Password". */
    readonly source: string;
    /** Whether `name` is the account name, which a username field may receive without a decrypt. */
    readonly nameIsUsername: boolean;
    use(
        field: "username" | "password",
        window: BrowserWindow,
        deliver: (login: BrowserLoginSecret) => Promise<void>,
    ): Promise<void>;
}

export interface BrowserLoginSource {
    list(pageOrigin: string): Promise<BrowserLoginSourceList>;
}

export interface BrowserLoginSourceList {
    readonly candidates: readonly BrowserLoginCandidate[];
}

/** A failure to use a picked login, in a short sentence fit to show the person. */
export class BrowserLoginUseError extends Error {}

/** Where a newly typed password may be saved. Happy itself never stores one. */
export interface BrowserLoginSaveTarget {
    readonly label: string;
    /** Whether saving is offered at all. Never connects. */
    connected(): boolean;
    /** Whether this target already holds this account for this site. */
    has(origin: string, username: string): Promise<boolean>;
    save(login: { origin: string; username: string; password: string }): Promise<void>;
}

/** The relation of a saved login's origin to a page's, or null when it is unrelated. */
export function browserLoginRelation(
    pageOrigin: string,
    loginOrigin: string,
): BrowserLoginRelation | null {
    if (pageOrigin === loginOrigin) return "exact";
    let page: URL;
    let login: URL;
    try {
        page = new URL(pageOrigin);
        login = new URL(loginOrigin);
    } catch {
        return null;
    }
    if (page.protocol !== "https:" || login.protocol !== "https:") return null;
    // The public-suffix list, private suffixes included, so two github.io
    // sites never count as one.
    const domain = getDomain(page.hostname, { allowPrivateDomains: true });
    return domain !== null && getDomain(login.hostname, { allowPrivateDomains: true }) === domain
        ? "related"
        : null;
}

/**
 * Lists every source's logins for one page. A source that takes too long is
 * left out of this picker rather than holding it closed; it still finishes in
 * the background, so its cache is warm for the next one.
 */
export async function browserLoginsList(
    sources: readonly BrowserLoginSource[],
    pageOrigin: string,
    timeout = 4_000,
): Promise<BrowserLoginSourceList> {
    const results = await Promise.all(
        sources.map(async (source): Promise<BrowserLoginSourceList> => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
                return await Promise.race([
                    source.list(pageOrigin),
                    new Promise<never>((_, reject) => {
                        timer = setTimeout(() => reject(new Error("Timed out.")), timeout);
                    }),
                ]);
            } catch {
                // A source that cannot be read offers nothing; the picker
                // shows only the logins it has.
                return { candidates: [] };
            } finally {
                clearTimeout(timer);
            }
        }),
    );
    const candidates = results
        .flatMap((result) => result.candidates)
        .sort(
            (left, right) =>
                (left.relation === "exact" ? 0 : 1) - (right.relation === "exact" ? 0 : 1) ||
                left.origin.localeCompare(right.origin) ||
                left.name.localeCompare(right.name) ||
                left.source.localeCompare(right.source),
        );
    return { candidates };
}
