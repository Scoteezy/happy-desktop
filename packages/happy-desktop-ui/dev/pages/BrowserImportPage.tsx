import { useState, useSyncExternalStore } from "react";
import {
    browserImportStoreOwnedCreate,
    type BrowserImportCatalog,
    type BrowserImportCookieDomainId,
    type BrowserImportLoginId,
    type BrowserImportProfileId,
    type BrowserImportProposal,
    type BrowserImportProposalId,
    type BrowserImportSiteId,
} from "happy-desktop-state";
import {
    BrowserImportDialog,
    HappyAgentPasswordSettings,
    HappyAgentSettingsShell,
} from "../../src";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "P-012e";

// Opaque fixture IDs and metadata only. No credential fields or values exist here.
const chromeId = "fixture-chrome" as BrowserImportProfileId;
const safariId = "fixture-safari" as BrowserImportProfileId;
const firefoxId = "fixture-firefox" as BrowserImportProfileId;
const proposalId = "fixture-proposal" as BrowserImportProposalId;
const docsId = "fixture-docs" as BrowserImportSiteId;
const docsPersonalLoginId = "fixture-docs-personal" as BrowserImportLoginId;
const docsAccountsDomainId = "fixture-docs-accounts" as BrowserImportCookieDomainId;
const catalog: BrowserImportCatalog = {
    profiles: [
        {
            id: chromeId,
            browser: "chrome",
            label: "Google Chrome",
            profileName: "Personal",
            cookies: { kind: "available" },
            passwords: { kind: "available" },
        },
        {
            id: "fixture-arc" as BrowserImportProfileId,
            browser: "arc",
            label: "Arc",
            profileName: "Default",
            cookies: { kind: "available" },
            passwords: { kind: "available" },
        },
        {
            id: "fixture-brave" as BrowserImportProfileId,
            browser: "brave",
            label: "Brave",
            profileName: "Work",
            cookies: { kind: "available" },
            passwords: { kind: "available" },
        },
        {
            id: "fixture-edge" as BrowserImportProfileId,
            browser: "edge",
            label: "Microsoft Edge",
            profileName: "Default",
            cookies: { kind: "available" },
            passwords: { kind: "available" },
        },
        {
            id: firefoxId,
            browser: "firefox",
            label: "Firefox",
            profileName: "Personal",
            cookies: { kind: "available" },
            passwords: { kind: "available" },
        },
        {
            id: safariId,
            browser: "safari",
            label: "Safari",
            profileName: "Default",
            cookies: { kind: "available" },
            passwords: {
                kind: "csv",
                reason: "Safari passwords must be imported from a password CSV export.",
            },
        },
    ],
    networkCount: 1,
};

const proposal: BrowserImportProposal = {
    id: proposalId,
    profileId: chromeId,
    sites: [
        {
            id: docsId,
            domain: "docs.example.com",
            cookieCount: 8,
            cookieDomains: [
                {
                    id: "fixture-docs-root" as BrowserImportCookieDomainId,
                    domain: ".example.com",
                    cookieCount: 5,
                },
                { id: docsAccountsDomainId, domain: "accounts.example.com", cookieCount: 2 },
                {
                    id: "fixture-docs-host" as BrowserImportCookieDomainId,
                    domain: "docs.example.com",
                    cookieCount: 1,
                },
            ],
            passwordCount: 2,
            origins: ["https://docs.example.com"],
            usernames: ["alex@example.com", "alex@work.example"],
            logins: [
                {
                    id: docsPersonalLoginId,
                    origin: "https://docs.example.com",
                    username: "alex@example.com",
                    passwordCount: 1,
                },
                {
                    id: "fixture-docs-work" as BrowserImportLoginId,
                    origin: "https://docs.example.com",
                    username: "alex@work.example",
                    passwordCount: 1,
                },
            ],
        },
        {
            id: "fixture-studio" as BrowserImportSiteId,
            domain: "studio.example.org",
            cookieCount: 3,
            cookieDomains: [
                {
                    id: "fixture-studio-cookies" as BrowserImportCookieDomainId,
                    domain: "studio.example.org",
                    cookieCount: 3,
                },
            ],
            passwordCount: 1,
            origins: ["https://studio.example.org:8443"],
            usernames: ["alex"],
            logins: [
                {
                    id: "fixture-studio-alex" as BrowserImportLoginId,
                    origin: "https://studio.example.org:8443",
                    username: "alex",
                    passwordCount: 1,
                },
            ],
        },
        {
            id: "fixture-forum" as BrowserImportSiteId,
            domain: "community.example.net",
            cookieCount: 4,
            cookieDomains: [
                {
                    id: "fixture-forum-cookies" as BrowserImportCookieDomainId,
                    domain: ".community.example.net",
                    cookieCount: 4,
                },
            ],
            passwordCount: 0,
            origins: [],
            usernames: [],
            logins: [],
        },
    ],
    notices: [],
    expiresAt: 2_000_000_000_000,
};

type Variant =
    | "profiles"
    | "unselected"
    | "selected"
    | "pending"
    | "result"
    | "partial"
    | "error"
    | "expired"
    | "windows-chrome"
    | "safari"
    | "firefox"
    | "no-browser"
    | "empty"
    | "large"
    | "logins"
    | "reading";
const noop = () => {};

function importFixtureCreate(variant: Variant) {
    const fixtureCatalog: BrowserImportCatalog =
        variant === "empty"
            ? { profiles: [], networkCount: 0 }
            : variant === "no-browser"
              ? { ...catalog, networkCount: 0 }
              : variant === "windows-chrome"
                ? {
                      ...catalog,
                      profiles: catalog.profiles.map((profile) =>
                          profile.id === chromeId
                              ? {
                                    ...profile,
                                    cookies: {
                                        kind: "unavailable" as const,
                                        reason: "Chrome’s app-bound encryption prevents session import on Windows.",
                                    },
                                    passwords: {
                                        kind: "csv" as const,
                                        reason: "Export passwords from Chrome to a CSV, then choose Import password CSV.",
                                    },
                                }
                              : profile,
                      ),
                  }
                : catalog;
    const owned = browserImportStoreOwnedCreate({
        output: {
            importOpenRequested() {
                owned.writer.importOpened(fixtureCatalog);
            },
            profileSelectRequested(profileId) {
                if (variant === "reading") return;
                owned.writer.proposalReceived({
                    ...proposal,
                    profileId,
                    sites:
                        variant === "windows-chrome"
                            ? []
                            : variant === "large"
                              ? Array.from({ length: 4000 }, (_, index) => ({
                                    id: `fixture-site-${String(index)}` as BrowserImportSiteId,
                                    domain: `site-${String(index)}.example.com`,
                                    cookieCount: 4,
                                    cookieDomains: [
                                        {
                                            id: `fixture-cookies-${String(index)}` as BrowserImportCookieDomainId,
                                            domain: `.site-${String(index)}.example.com`,
                                            cookieCount: 4,
                                        },
                                    ],
                                    passwordCount: 1,
                                    origins: [`https://site-${String(index)}.example.com`],
                                    usernames: [`account-${String(index)}@example.com`],
                                    logins: [
                                        {
                                            id: `fixture-login-${String(index)}` as BrowserImportLoginId,
                                            origin: `https://site-${String(index)}.example.com`,
                                            username: `account-${String(index)}@example.com`,
                                            passwordCount: 1,
                                        },
                                    ],
                                }))
                              : profileId === safariId
                                ? proposal.sites.map((site) => ({
                                      ...site,
                                      passwordCount: 0,
                                      usernames: [],
                                      logins: [],
                                  }))
                                : profileId === firefoxId
                                  ? proposal.sites.map((site) => ({
                                        ...site,
                                        usernames: [],
                                        // Firefox names stay encrypted: one choice per origin.
                                        logins: site.logins.length
                                            ? [
                                                  {
                                                      id: site.logins[0]!.id,
                                                      origin: site.logins[0]!.origin,
                                                      passwordCount: site.passwordCount,
                                                  },
                                              ]
                                            : [],
                                    }))
                                  : proposal.sites,
                    notices:
                        profileId === safariId
                            ? [
                                  "Safari session import requires Full Disk Access. Passwords use Safari’s own CSV export.",
                              ]
                            : profileId === firefoxId
                              ? [
                                    "Firefox may ask for its primary password after you choose sites and start importing.",
                                ]
                              : [],
                });
            },
        },
    });
    owned.store.importOpen();
    if (variant !== "profiles" && variant !== "empty")
        owned.store.profileSelect(
            variant === "safari" ? safariId : variant === "firefox" ? firefoxId : chromeId,
        );
    if (["selected", "pending", "result", "partial", "error"].includes(variant)) {
        owned.store.cookieSiteSelect(docsId, true);
        owned.store.passwordSiteSelect(docsId, true);
    }
    if (variant === "logins") {
        owned.store.cookieDomainSelect(docsAccountsDomainId, true);
        owned.store.passwordLoginSelect(docsPersonalLoginId, true);
    }
    if (["pending", "result", "partial"].includes(variant)) {
        owned.store.importCommit();
        owned.writer.progressReceived({ proposalId, phase: "cookies", completed: 4, total: 8 });
    }
    if (variant === "result" || variant === "partial")
        owned.writer.importFinished({
            cookiesImported: variant === "partial" ? 0 : 8,
            passwordsImported: 2,
            cookiesSkipped: variant === "partial" ? 8 : 0,
            passwordsSkipped: 0,
            warnings:
                variant === "partial"
                    ? [
                          "The built-in browser could not save these sessions. Passwords remain saved in the vault.",
                      ]
                    : [],
        });
    if (variant === "error")
        owned.writer.operationFailed(
            "The browser could not be unlocked. Your chosen sites are still selected; check system authorization and try again.",
        );
    if (variant === "expired") owned.writer.proposalExpired(proposalId);
    return owned;
}

function BrowserImportSpecimen(props: {
    readonly variant: Variant;
    readonly label: string;
    readonly detail: string;
    readonly number: string;
    readonly width?: 1100 | 720;
    readonly screen?: string;
}) {
    const [owned] = useState(() => importFixtureCreate(props.variant));
    const snapshot = useSyncExternalStore(owned.store.subscribe, owned.store.get, owned.store.get);
    return (
        <FullScreenSpecimen
            detail={props.detail}
            label={props.label}
            number={props.number}
            screen={props.screen}
            window={{ width: props.width ?? 720, height: props.width === 1100 ? 760 : 640 }}
        >
            {/* This desktop frame is the containing block for its fixed native-style overlay. */}
            <div style={{ display: "flex", contain: "layout paint" }}>
                <HappyAgentSettingsShell
                    activeCategoryId="passwords"
                    categories={[
                        { id: "general", icon: "settings", label: "General" },
                        { id: "passwords", icon: "lock", label: "Passwords" },
                    ]}
                    description="Your encrypted vault on this device"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Passwords"
                >
                    <HappyAgentPasswordSettings
                        available
                        logins={[]}
                        onBrowserImportChoose={owned.store.importOpen}
                        onImportChoose={noop}
                        onImportSiteSelect={noop}
                        onImportCommit={noop}
                        onImportCancel={noop}
                        onLoginRemove={noop}
                        onLoginReveal={noop}
                        selectedOrigins={new Set()}
                    />
                </HappyAgentSettingsShell>
                <BrowserImportDialog
                    snapshot={snapshot}
                    onClose={owned.store.importClose}
                    onProfileSelect={owned.store.profileSelect}
                    initialExpandedSiteIds={props.variant === "logins" ? [docsId] : undefined}
                    onCookieSiteSelect={owned.store.cookieSiteSelect}
                    onCookieSitesSelect={owned.store.cookieSitesSelect}
                    onCookieDomainSelect={owned.store.cookieDomainSelect}
                    onPasswordSiteSelect={owned.store.passwordSiteSelect}
                    onPasswordSitesSelect={owned.store.passwordSitesSelect}
                    onPasswordLoginSelect={owned.store.passwordLoginSelect}
                    onImportCommit={() => {
                        owned.store.importCommit();
                        const current = owned.store.get();
                        if (!current.pending) return;
                        owned.writer.importFinished({
                            cookiesImported:
                                current.proposal?.sites.reduce(
                                    (count, site) =>
                                        count +
                                        site.cookieDomains.reduce(
                                            (sum, domain) =>
                                                sum +
                                                (current.cookieDomainIds.has(domain.id)
                                                    ? domain.cookieCount
                                                    : 0),
                                            0,
                                        ),
                                    0,
                                ) ?? 0,
                            passwordsImported:
                                current.proposal?.sites.reduce(
                                    (count, site) =>
                                        count +
                                        site.logins.reduce(
                                            (sum, login) =>
                                                sum +
                                                (current.passwordLoginIds.has(login.id)
                                                    ? login.passwordCount
                                                    : 0),
                                            0,
                                        ),
                                    0,
                                ) ?? 0,
                            cookiesSkipped: 0,
                            passwordsSkipped: 0,
                            warnings: [],
                        });
                    }}
                    onPasswordCsvChoose={owned.store.importClose}
                />
            </div>
        </FullScreenSpecimen>
    );
}

export function BrowserImportPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Browser import"
            summary="Choose a source profile and sites before the browser is unlocked; sessions go to the built-in browser. Metadata-only native import with live progress and explicit CSV fallback."
        >
            {([1100, 720] as const).map((width) => {
                const size = `${String(width)}x${width === 1100 ? "760" : "640"}`;
                return (
                    <div key={width} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                        <BrowserImportSpecimen
                            detail={`${size}; six source browsers, no default source or site selection`}
                            label="Choose a source profile"
                            number={`01-${size}`}
                            screen={`01-source-${size}`}
                            variant="profiles"
                            width={width}
                        />
                        <BrowserImportSpecimen
                            detail={`${size}; independent session and password checkboxes, every site unselected`}
                            label="Choose sites"
                            number={`02-${size}`}
                            screen={`02-sites-${size}`}
                            variant="unselected"
                            width={width}
                        />
                        <BrowserImportSpecimen
                            detail={`${size}; only the chosen site selected`}
                            label="Ready to import"
                            number={`03-${size}`}
                            screen={`03-selected-${size}`}
                            variant="selected"
                            width={width}
                        />
                        <BrowserImportSpecimen
                            detail={`${size}; authoritative imported and skipped counts`}
                            label="Import finished"
                            number={`04-${size}`}
                            screen={`04-finished-${size}`}
                            variant="result"
                            width={width}
                        />
                    </div>
                );
            })}
            <BrowserImportSpecimen
                detail="Live measured progress, locked choices, and disabled dismissal"
                label="Import in progress"
                number="05"
                variant="pending"
            />
            <BrowserImportSpecimen
                detail="Selection remains intact after an authorization failure"
                label="Import error"
                number="06"
                variant="error"
            />
            <BrowserImportSpecimen
                detail="Expired proposals clear all site selections and require a new profile choice"
                label="Expired selection"
                number="07"
                variant="expired"
            />
            <BrowserImportSpecimen
                detail="App-bound encryption explains unavailable Chrome sessions and the password CSV fallback"
                label="Windows Chrome"
                number="08"
                variant="windows-chrome"
            />
            <BrowserImportSpecimen
                detail="Full Disk Access for sessions, CSV for Safari passwords"
                label="Safari"
                number="09"
                variant="safari"
            />
            <BrowserImportSpecimen
                detail="Primary password requested only after the person chooses sites; no account name inference"
                label="Firefox"
                number="10"
                variant="firefox"
            />
            <BrowserImportSpecimen
                detail="Sessions need the built-in browser opened once; the catalog updates on its own"
                label="Built-in browser never opened"
                number="11"
                variant="no-browser"
            />
            <BrowserImportSpecimen
                detail="Password CSV remains available when discovery finds no source profiles"
                label="No source profiles"
                number="12"
                variant="empty"
            />
            <BrowserImportSpecimen
                detail="4,000 site metadata rows with a bounded DOM and keyboard navigation"
                label="Large profile"
                number="13"
                variant="large"
            />
            <BrowserImportSpecimen
                detail="Source chooser and cancellation remain available while scanning"
                label="Reading site metadata"
                number="14"
                variant="reading"
            />
            <BrowserImportSpecimen
                detail="A closed destination reports skipped sessions while preserving confirmed saved passwords"
                label="Partial import result"
                number="15"
                variant="partial"
            />
            <BrowserImportSpecimen
                detail="A site opened under it: one cookie domain and one of two accounts chosen leave both of its boxes mixed"
                label="Choosing session domains and logins"
                screen="browser-import-choices"
                number="16"
                variant="logins"
            />
        </ComponentPage>
    );
}
