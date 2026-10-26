/** Public browser-import contracts contain metadata and user intent only. */
declare const profileBrand: unique symbol;
declare const proposalBrand: unique symbol;
declare const siteBrand: unique symbol;
declare const loginBrand: unique symbol;
declare const cookieDomainBrand: unique symbol;
export type BrowserImportProfileId = string & { readonly [profileBrand]: true };
export type BrowserImportProposalId = string & { readonly [proposalBrand]: true };
export type BrowserImportSiteId = string & { readonly [siteBrand]: true };
export type BrowserImportLoginId = string & { readonly [loginBrand]: true };
export type BrowserImportCookieDomainId = string & { readonly [cookieDomainBrand]: true };
export type BrowserImportBrowser = "chrome" | "arc" | "brave" | "edge" | "firefox" | "safari";

export type BrowserImportCapability =
    | { readonly kind: "available" }
    | { readonly kind: "csv"; readonly reason: string }
    | { readonly kind: "unavailable"; readonly reason: string };

export interface BrowserImportProfileSnapshot {
    readonly id: BrowserImportProfileId;
    readonly browser: BrowserImportBrowser;
    readonly label: string;
    readonly profileName: string;
    readonly cookies: BrowserImportCapability;
    readonly passwords: BrowserImportCapability;
}

export interface BrowserImportCatalog {
    readonly profiles: readonly BrowserImportProfileSnapshot[];
    /**
     * Built-in browser profiles on this computer. Imported sessions go to every
     * one; with none, the browser has not been opened yet and sessions cannot land.
     */
    readonly networkCount: number;
}

/** One saved account the person can choose on its own: an origin and account name. */
export interface BrowserImportLoginSnapshot {
    readonly id: BrowserImportLoginId;
    readonly origin: string;
    /** Absent for Firefox, whose account names stay encrypted until unlock. */
    readonly username?: string;
    /** Saved passwords this choice imports; above 1 only for an unnamed Firefox origin. */
    readonly passwordCount: number;
}

/** Sessions stored for one cookie domain of a site, such as `accounts.google.com`. */
export interface BrowserImportCookieDomainSnapshot {
    readonly id: BrowserImportCookieDomainId;
    /** The source browser's cookie domain; a leading dot also covers subdomains. */
    readonly domain: string;
    readonly cookieCount: number;
}

export interface BrowserImportSiteSnapshot {
    readonly id: BrowserImportSiteId;
    readonly domain: string;
    readonly cookieCount: number;
    /** Sorted by domain; their counts add up to `cookieCount`. */
    readonly cookieDomains: readonly BrowserImportCookieDomainSnapshot[];
    readonly passwordCount: number;
    readonly origins: readonly string[];
    /** Firefox accounts remain unknown until the person selects a site and unlocks NSS. */
    readonly usernames: readonly string[];
    /** Sorted by origin, then account name. */
    readonly logins: readonly BrowserImportLoginSnapshot[];
}

export interface BrowserImportProposal {
    readonly id: BrowserImportProposalId;
    readonly profileId: BrowserImportProfileId;
    readonly sites: readonly BrowserImportSiteSnapshot[];
    readonly notices: readonly string[];
    readonly expiresAt: number;
}

export interface BrowserImportSelection {
    readonly proposalId: BrowserImportProposalId;
    readonly cookieDomainIds: readonly BrowserImportCookieDomainId[];
    readonly passwordLoginIds: readonly BrowserImportLoginId[];
}

export interface BrowserImportResult {
    readonly cookiesImported: number;
    readonly passwordsImported: number;
    readonly cookiesSkipped: number;
    readonly passwordsSkipped: number;
    readonly warnings: readonly string[];
}

export interface BrowserImportProgress {
    readonly proposalId: BrowserImportProposalId;
    readonly phase: "decrypting" | "passwords" | "cookies";
    readonly completed: number;
    readonly total: number;
}

export type BrowserImportEvent =
    | { readonly type: "catalogReceived"; readonly catalog: BrowserImportCatalog }
    | { readonly type: "proposalReceived"; readonly proposal: BrowserImportProposal }
    | { readonly type: "proposalExpired"; readonly id: BrowserImportProposalId }
    | { readonly type: "progressReceived"; readonly progress: BrowserImportProgress }
    | { readonly type: "sourceFailed"; readonly message: string };
