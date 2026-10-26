import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { Fragment, useId, useRef, useState } from "react";
import type {
    BrowserImportCookieDomainId,
    BrowserImportLoginId,
    BrowserImportProfileId,
    BrowserImportSiteId,
    BrowserImportSiteSnapshot,
    BrowserImportSnapshot,
} from "happy-desktop-state";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { EmptyState } from "./EmptyState";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { ScrollArea } from "./Scrollbar";
import { Select } from "./Select";
import { Spinner } from "./Spinner";
import { TextField } from "./TextField";
import { Tooltip } from "./Tooltip";
import { browserImportMetadataSummary } from "./browserImportMetadataSummary";

export interface BrowserImportDialogProps {
    readonly snapshot: BrowserImportSnapshot;
    /** Sites whose logins start open, so a fixture can render that state. */
    readonly initialExpandedSiteIds?: readonly BrowserImportSiteId[];
    onClose(): void;
    onProfileSelect(id: BrowserImportProfileId): void;
    onCookieSiteSelect(id: BrowserImportSiteId, selected: boolean): void;
    onCookieSitesSelect(ids: readonly BrowserImportSiteId[], selected: boolean): void;
    onCookieDomainSelect(id: BrowserImportCookieDomainId, selected: boolean): void;
    /** Selects or clears every saved login of the site. */
    onPasswordSiteSelect(id: BrowserImportSiteId, selected: boolean): void;
    onPasswordSitesSelect(ids: readonly BrowserImportSiteId[], selected: boolean): void;
    onPasswordLoginSelect(id: BrowserImportLoginId, selected: boolean): void;
    onImportCommit(): void;
    onPasswordCsvChoose?(): void;
}

interface BrowserImportHintSection {
    readonly title: string;
    readonly text: string;
}

const browserImportPolicy: readonly BrowserImportHintSection[] = [
    {
        title: "Selection",
        text: "Nothing is selected by default. Only the sites you select are imported, after you confirm.",
    },
    {
        title: "Sessions",
        text: "Only secure session cookies are eligible; Happy domains and Google device-bound sign-in are excluded. Sessions go to the built-in browser.",
    },
    {
        title: "Passwords",
        text: "Passwords stay in this device’s encrypted vault and are never sent to agents. Safari and Windows Chrome passwords require a CSV export.",
    },
];

/** Titled paragraphs for a hover hint, one topic each, with a rule between topics. */
function BrowserImportHint(props: { readonly sections: readonly BrowserImportHintSection[] }) {
    return (
        <span className="happy-browser-import__hint">
            {props.sections.map((section, index) => (
                <Fragment key={`${section.title}-${String(index)}`}>
                    {index > 0 ? (
                        <span aria-hidden className="happy-browser-import__hint-rule" />
                    ) : null}
                    <span className="happy-browser-import__hint-section">
                        <strong>{section.title}</strong>
                        <span>{section.text}</span>
                    </span>
                </Fragment>
            ))}
        </span>
    );
}

/** How much of a site's cookie domains are chosen: drives a checked or mixed box. */
function cookieSelection(
    site: BrowserImportSiteSnapshot,
    selected: ReadonlySet<BrowserImportCookieDomainId>,
): { readonly all: boolean; readonly some: boolean } {
    const count = site.cookieDomains.filter((domain) => selected.has(domain.id)).length;
    return { all: count > 0 && count === site.cookieDomains.length, some: count > 0 };
}

/** How much of a site's saved logins are chosen: drives a checked or mixed box. */
function passwordSelection(
    site: BrowserImportSiteSnapshot,
    selected: ReadonlySet<BrowserImportLoginId>,
): { readonly all: boolean; readonly some: boolean } {
    const count = site.logins.filter((login) => selected.has(login.id)).length;
    return { all: count > 0 && count === site.logins.length, some: count > 0 };
}

function BrowserImportSites(props: BrowserImportDialogProps) {
    const [query, querySet] = useState("");
    const snapshot = props.snapshot;
    const profile = snapshot.catalog.profiles.find((entry) => entry.id === snapshot.profileId);
    const needle = query.trim().toLowerCase();
    const allSites = snapshot.proposal?.sites ?? [];
    const sites = needle
        ? allSites.filter(
              (site) =>
                  site.domain.toLowerCase().includes(needle) ||
                  site.origins.some((origin) => origin.toLowerCase().includes(needle)) ||
                  site.usernames.some((username) => username.toLowerCase().includes(needle)),
          )
        : allSites;
    // "All" acts on what the person sees: every site, or every search match.
    const cookieSites = sites.filter((site) => site.cookieCount > 0);
    const passwordSites = sites.filter((site) => site.logins.length > 0);
    const cookiesChosen = cookieSites.map((site) =>
        cookieSelection(site, snapshot.cookieDomainIds),
    );
    const cookiesAll = cookiesChosen.length > 0 && cookiesChosen.every((state) => state.all);
    const passwordsChosen = passwordSites.map((site) =>
        passwordSelection(site, snapshot.passwordLoginIds),
    );
    const passwordsAll = passwordsChosen.length > 0 && passwordsChosen.every((state) => state.all);
    const idle = snapshot.pending || snapshot.loading;
    return (
        <div className="happy-browser-import__site-list">
            <TextField
                aria-label="Search sites"
                fullWidth
                leadingIcon="search"
                onValueChange={querySet}
                placeholder="Search sites"
                size="small"
                type="search"
                value={query}
            />
            <div className="happy-browser-import__select-all">
                <span className="happy-browser-import__select-all-label">
                    {needle
                        ? `${String(sites.length)} matching ${sites.length === 1 ? "site" : "sites"}`
                        : `All ${String(sites.length)} sites`}
                </span>
                <div className="happy-browser-import__site-controls">
                    <Checkbox
                        aria-label={
                            needle
                                ? "Select sessions of every matching site"
                                : "Select every session"
                        }
                        checked={cookiesAll}
                        disabled={
                            idle ||
                            cookieSites.length === 0 ||
                            profile?.cookies.kind !== "available"
                        }
                        indeterminate={!cookiesAll && cookiesChosen.some((state) => state.some)}
                        label="All sessions"
                        onChange={(selected) =>
                            props.onCookieSitesSelect(
                                cookieSites.map((site) => site.id),
                                selected,
                            )
                        }
                    />
                    <Checkbox
                        aria-label={
                            needle
                                ? "Select passwords of every matching site"
                                : "Select every password"
                        }
                        checked={passwordsAll}
                        disabled={
                            idle ||
                            passwordSites.length === 0 ||
                            profile?.passwords.kind !== "available"
                        }
                        indeterminate={!passwordsAll && passwordsChosen.some((state) => state.some)}
                        label="All passwords"
                        onChange={(selected) =>
                            props.onPasswordSitesSelect(
                                passwordSites.map((site) => site.id),
                                selected,
                            )
                        }
                    />
                    <span aria-hidden className="happy-browser-import__expand-slot" />
                </div>
            </div>
            {sites.length > 0 ? (
                <BrowserImportSiteRows {...props} sites={sites} />
            ) : (
                <div className="happy-browser-import__sites-empty">
                    <EmptyState
                        description="Try another part of the domain or an account name."
                        icon="search"
                        size="inline"
                        title="No matching sites"
                    />
                </div>
            )}
        </div>
    );
}

function BrowserImportSiteRows(
    props: BrowserImportDialogProps & { readonly sites: readonly BrowserImportSiteSnapshot[] },
) {
    const snapshot = props.snapshot;
    const sites = props.sites;
    const profile = snapshot.catalog.profiles.find((entry) => entry.id === snapshot.profileId);
    const viewport = useRef<HTMLDivElement>(null);
    const [focusedId, focusedIdSet] = useState<BrowserImportSiteId>();
    const [expanded, expandedSet] = useState<ReadonlySet<BrowserImportSiteId>>(
        () => new Set(props.initialExpandedSiteIds),
    );
    const focusedIndex = sites.findIndex((site) => site.id === focusedId);
    const pendingFocus = useRef<
        { readonly id: BrowserImportSiteId; readonly index: number } | undefined
    >(undefined);
    // TanStack Virtual owns mutable measurement methods. Keep this integration
    // outside compiler memoization while the site's ordinary children compile.
    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: sites.length,
        // A 64px card plus the 8px gap below it, and 36px per session domain or
        // login while a site is open. Rows measure themselves; this only seeds them.
        estimateSize: (index) => {
            const site = sites[index]!;
            return (
                72 +
                (expanded.has(site.id)
                    ? (site.cookieDomains.length + site.logins.length) * 36 + 48
                    : 0)
            );
        },
        getItemKey: (index) => sites[index]!.id,
        getScrollElement: () => viewport.current,
        initialRect: { width: 0, height: 248 },
        overscan: 3,
        rangeExtractor: (range) => {
            const drawn = defaultRangeExtractor(range);
            return focusedIndex < 0 || drawn.includes(focusedIndex)
                ? drawn
                : [...drawn, focusedIndex].sort((left, right) => left - right);
        },
        useFlushSync: false,
    });
    return (
        <ScrollArea
            aria-label="Sites available for import"
            className="happy-browser-import__sites"
            data-happy-desktop-ui="browser-import-sites"
            viewportClassName="happy-browser-import__sites-viewport"
            viewportRef={viewport}
        >
            <div
                className="happy-browser-import__site-inset"
                style={{ height: virtualizer.getTotalSize() + 8 }}
            >
                {virtualizer.getVirtualItems().map((row) => {
                    const site = sites[row.index]!;
                    const detail = [
                        browserImportMetadataSummary(site.origins) ||
                            "Secure sessions for this domain",
                        browserImportMetadataSummary(site.usernames),
                    ]
                        .filter(Boolean)
                        .join(" · ");
                    const cookieDisabled =
                        snapshot.pending ||
                        snapshot.loading ||
                        site.cookieCount === 0 ||
                        profile?.cookies.kind !== "available";
                    const passwordDisabled =
                        snapshot.pending ||
                        snapshot.loading ||
                        site.logins.length === 0 ||
                        profile?.passwords.kind !== "available";
                    const sessions = cookieSelection(site, snapshot.cookieDomainIds);
                    const passwords = passwordSelection(site, snapshot.passwordLoginIds);
                    // A single cookie domain or login is already the site's own box.
                    const domainChoice = site.cookieDomains.length > 1;
                    const loginChoice = site.logins.length > 1;
                    const expandable = domainChoice || loginChoice;
                    const open = expanded.has(site.id) && expandable;
                    const choices = [
                        domainChoice ? "session domains" : "",
                        loginChoice ? "logins" : "",
                    ]
                        .filter(Boolean)
                        .join(" and ");
                    return (
                        <div
                            className="happy-browser-import__site-position"
                            data-happy-desktop-ui="browser-import-site-row"
                            data-index={row.index}
                            key={row.key}
                            onBlurCapture={(event) => {
                                if (!event.currentTarget.contains(event.relatedTarget))
                                    focusedIdSet(undefined);
                            }}
                            onFocusCapture={() => focusedIdSet(site.id)}
                            onKeyDown={(event) => {
                                let next: number;
                                if (event.key === "ArrowDown") next = row.index + 1;
                                else if (event.key === "ArrowUp") next = row.index - 1;
                                else if (event.key === "Home") next = 0;
                                else if (event.key === "End") next = sites.length - 1;
                                else return;
                                const target = sites[next];
                                if (!target) return;
                                event.preventDefault();
                                const controls = [
                                    ...event.currentTarget.querySelectorAll<HTMLInputElement>(
                                        ".happy-browser-import__site-main input",
                                    ),
                                ];
                                pendingFocus.current = {
                                    id: target.id,
                                    index: Math.max(
                                        0,
                                        controls.indexOf(event.target as HTMLInputElement),
                                    ),
                                };
                                focusedIdSet(target.id);
                                virtualizer.scrollToIndex(next, { align: "auto" });
                            }}
                            ref={(element) => {
                                virtualizer.measureElement(element);
                                if (element && pendingFocus.current?.id === site.id) {
                                    const controls = [
                                        ...element.querySelectorAll<HTMLInputElement>(
                                            ".happy-browser-import__site-main input",
                                        ),
                                    ];
                                    const control = controls[pendingFocus.current.index];
                                    pendingFocus.current = undefined;
                                    (control && !control.disabled
                                        ? control
                                        : controls.find((input) => !input.disabled)
                                    )?.focus();
                                }
                            }}
                            style={{ transform: `translateY(${String(row.start + 4)}px)` }}
                        >
                            <article className="happy-browser-import__site">
                                <div className="happy-browser-import__site-main">
                                    <div className="happy-browser-import__site-text">
                                        <strong title={site.domain}>{site.domain}</strong>
                                        <span title={detail}>{detail}</span>
                                    </div>
                                    <div className="happy-browser-import__site-controls">
                                        <Checkbox
                                            aria-label={`Import ${String(site.cookieCount)} session cookies for ${site.domain}`}
                                            checked={sessions.all}
                                            disabled={cookieDisabled}
                                            indeterminate={sessions.some && !sessions.all}
                                            label={`Sessions · ${String(site.cookieCount)}`}
                                            onChange={(selected) =>
                                                props.onCookieSiteSelect(site.id, selected)
                                            }
                                        />
                                        <Checkbox
                                            aria-label={`Import all ${String(site.passwordCount)} passwords for ${site.domain}`}
                                            checked={passwords.all}
                                            disabled={passwordDisabled}
                                            indeterminate={passwords.some && !passwords.all}
                                            label={`Passwords · ${String(site.passwordCount)}`}
                                            onChange={(selected) =>
                                                props.onPasswordSiteSelect(site.id, selected)
                                            }
                                        />
                                        {expandable ? (
                                            <Button
                                                aria-expanded={open}
                                                aria-label={`${open ? "Hide" : "Choose"} ${choices} for ${site.domain}`}
                                                icon={open ? "chevron-up" : "chevron-down"}
                                                iconOnly
                                                onClick={() => {
                                                    const next = new Set(expanded);
                                                    if (open) next.delete(site.id);
                                                    else next.add(site.id);
                                                    expandedSet(next);
                                                }}
                                                size="small"
                                                variant="ghost"
                                            />
                                        ) : (
                                            <span
                                                aria-hidden
                                                className="happy-browser-import__expand-slot"
                                            />
                                        )}
                                    </div>
                                </div>
                                {open && domainChoice ? (
                                    <div
                                        aria-label={`Sessions for ${site.domain}`}
                                        className="happy-browser-import__logins"
                                        role="group"
                                    >
                                        {loginChoice ? (
                                            <span className="happy-browser-import__logins-title">
                                                Sessions
                                            </span>
                                        ) : null}
                                        {site.cookieDomains.map((domain) => (
                                            <div
                                                className="happy-browser-import__login"
                                                key={domain.id}
                                            >
                                                <Checkbox
                                                    aria-label={`Import ${String(domain.cookieCount)} session cookies for ${domain.domain}`}
                                                    checked={snapshot.cookieDomainIds.has(
                                                        domain.id,
                                                    )}
                                                    disabled={cookieDisabled}
                                                    label={domain.domain}
                                                    onChange={(selected) =>
                                                        props.onCookieDomainSelect(
                                                            domain.id,
                                                            selected,
                                                        )
                                                    }
                                                />
                                                <span>
                                                    {domain.cookieCount}{" "}
                                                    {domain.cookieCount === 1
                                                        ? "cookie"
                                                        : "cookies"}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                {open && loginChoice ? (
                                    <div
                                        aria-label={`Logins for ${site.domain}`}
                                        className="happy-browser-import__logins"
                                        role="group"
                                    >
                                        {domainChoice ? (
                                            <span className="happy-browser-import__logins-title">
                                                Passwords
                                            </span>
                                        ) : null}
                                        {site.logins.map((login) => (
                                            <div
                                                className="happy-browser-import__login"
                                                key={login.id}
                                            >
                                                <Checkbox
                                                    aria-label={`Import ${login.username ?? "the hidden account"} for ${login.origin}`}
                                                    checked={snapshot.passwordLoginIds.has(
                                                        login.id,
                                                    )}
                                                    disabled={passwordDisabled}
                                                    label={
                                                        login.username ||
                                                        (login.username === undefined
                                                            ? `${String(login.passwordCount)} hidden accounts`
                                                            : "No account name")
                                                    }
                                                    onChange={(selected) =>
                                                        props.onPasswordLoginSelect(
                                                            login.id,
                                                            selected,
                                                        )
                                                    }
                                                />
                                                <span title={login.origin}>{login.origin}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </article>
                        </div>
                    );
                })}
            </div>
        </ScrollArea>
    );
}

/** Explicit per-site native import. Props and rendered content contain metadata only. */
export function BrowserImportDialog(props: BrowserImportDialogProps) {
    const snapshot = props.snapshot;
    const profileControlId = useId();
    if (!snapshot.open) return null;
    const profile = snapshot.catalog.profiles.find((entry) => entry.id === snapshot.profileId);
    const selectedSites =
        snapshot.proposal?.sites.filter(
            (site) =>
                site.cookieDomains.some((domain) => snapshot.cookieDomainIds.has(domain.id)) ||
                site.logins.some((login) => snapshot.passwordLoginIds.has(login.id)),
        ) ?? [];
    const cookies = selectedSites.reduce(
        (count, site) =>
            count +
            site.cookieDomains.reduce(
                (sum, domain) =>
                    sum + (snapshot.cookieDomainIds.has(domain.id) ? domain.cookieCount : 0),
                0,
            ),
        0,
    );
    const passwords = selectedSites.reduce(
        (count, site) =>
            count +
            site.logins.reduce(
                (sum, login) =>
                    sum + (snapshot.passwordLoginIds.has(login.id) ? login.passwordCount : 0),
                0,
            ),
        0,
    );
    const commitDisabled =
        snapshot.loading ||
        snapshot.pending ||
        !snapshot.proposal ||
        selectedSites.length === 0 ||
        (cookies > 0 && snapshot.catalog.networkCount === 0);
    const close = () => {
        if (!snapshot.pending) props.onClose();
    };
    // Explanations stay one hover away so the site list keeps the dialog's height.
    const notes: BrowserImportHintSection[] = [
        ...(profile && profile.cookies.kind !== "available"
            ? [{ title: "Sessions", text: profile.cookies.reason }]
            : []),
        ...(profile && profile.passwords.kind !== "available"
            ? [{ title: "Passwords", text: profile.passwords.reason }]
            : []),
        ...(profile?.cookies.kind === "available" && snapshot.catalog.networkCount === 0
            ? [
                  {
                      title: "Built-in browser",
                      text: "Open the built-in browser once to import sessions. They go there.",
                  },
              ]
            : []),
        ...(snapshot.proposal?.notices ?? []).map((text) => ({ title: "Source browser", text })),
    ];
    const progressLabel =
        snapshot.progress?.phase === "cookies"
            ? "Saving sessions in the built-in browser"
            : snapshot.progress?.phase === "passwords"
              ? "Saving passwords in the encrypted vault"
              : "Unlocking the selected sites";
    return (
        <ModalOverlay onDismiss={close}>
            <Modal
                className={
                    snapshot.result
                        ? "happy-browser-import-modal happy-browser-import-modal--result"
                        : "happy-browser-import-modal"
                }
                footer={
                    <div className="happy-browser-import__footer">
                        {props.onPasswordCsvChoose && !snapshot.result ? (
                            <Button
                                disabled={snapshot.pending || snapshot.loading}
                                onClick={props.onPasswordCsvChoose}
                                variant="ghost"
                            >
                                Import password CSV…
                            </Button>
                        ) : null}
                        <div className="happy-browser-import__footer-actions">
                            {!snapshot.result ? (
                                <Button
                                    disabled={snapshot.pending}
                                    onClick={close}
                                    variant="secondary"
                                >
                                    Cancel
                                </Button>
                            ) : null}
                            <Button
                                disabled={snapshot.result ? false : commitDisabled}
                                onClick={snapshot.result ? close : props.onImportCommit}
                            >
                                {snapshot.result
                                    ? "Done"
                                    : snapshot.pending
                                      ? "Importing…"
                                      : `Import ${String(selectedSites.length)} ${selectedSites.length === 1 ? "site" : "sites"}`}
                            </Button>
                        </div>
                    </div>
                }
                icon="globe"
                onClose={snapshot.pending ? undefined : close}
                size="large"
                title="Import from a browser"
            >
                <div className="happy-browser-import" data-happy-desktop-ui="browser-import-dialog">
                    {!snapshot.proposal ? (
                        <p className="happy-browser-import__note">
                            Sessions go to the built-in browser. Passwords stay in this device’s
                            encrypted vault.
                        </p>
                    ) : null}
                    {snapshot.error ? (
                        <Banner tone="danger" title="Import needs attention">
                            {snapshot.error}
                        </Banner>
                    ) : null}
                    {snapshot.result ? (
                        <>
                            <Banner tone="success" title="Import finished">
                                {snapshot.result.cookiesImported} session cookies and{" "}
                                {snapshot.result.passwordsImported} passwords imported.{" "}
                                {snapshot.result.cookiesSkipped} session cookies and{" "}
                                {snapshot.result.passwordsSkipped} passwords skipped.
                            </Banner>
                            {snapshot.result.warnings.length > 0 ? (
                                <Banner tone="warning" title="Some items need attention">
                                    {snapshot.result.warnings.join(" ")}
                                </Banner>
                            ) : null}
                            <p className="happy-browser-import__note">
                                Open the built-in browser to use the imported sessions. Choose a
                                saved login in Happy’s picker to fill a password.
                            </p>
                            {snapshot.profileId ? (
                                <Button
                                    onClick={() => {
                                        if (snapshot.profileId)
                                            props.onProfileSelect(snapshot.profileId);
                                    }}
                                    variant="secondary"
                                >
                                    Import more from this profile
                                </Button>
                            ) : null}
                        </>
                    ) : (
                        <>
                            <div className="happy-browser-import__sources">
                                <Select
                                    disabled={
                                        snapshot.pending ||
                                        (snapshot.loading && snapshot.catalog.profiles.length === 0)
                                    }
                                    fullWidth
                                    id={profileControlId}
                                    label="Source browser profile"
                                    onValueChange={(value) => {
                                        const selected = snapshot.catalog.profiles.find(
                                            (entry) => entry.id === value,
                                        );
                                        if (selected) props.onProfileSelect(selected.id);
                                    }}
                                    options={snapshot.catalog.profiles.map((entry) => ({
                                        value: entry.id,
                                        label: `${entry.label} · ${entry.profileName}`,
                                    }))}
                                    placeholder="Choose a browser profile"
                                    value={snapshot.profileId}
                                />
                            </div>
                            <div className="happy-browser-import__summary">
                                <div
                                    aria-live="polite"
                                    className="happy-browser-import__status"
                                    role="status"
                                >
                                    {snapshot.loading || snapshot.pending ? (
                                        <Spinner size={16} />
                                    ) : null}
                                    {snapshot.pending
                                        ? progressLabel
                                        : snapshot.loading
                                          ? snapshot.profileId
                                              ? "Reading site metadata…"
                                              : "Finding browser profiles…"
                                          : snapshot.proposal
                                            ? `${String(selectedSites.length)} of ${String(snapshot.proposal.sites.length)} sites selected · ${String(cookies)} session cookies · ${String(passwords)} passwords`
                                            : "Choose a profile to see its sites before unlocking anything."}
                                </div>
                                {notes.length > 0 ? (
                                    <Tooltip
                                        align="end"
                                        label={<BrowserImportHint sections={notes} />}
                                        placement="bottom"
                                    >
                                        <Button
                                            aria-label="Before you import"
                                            icon="alert"
                                            iconOnly
                                            size="small"
                                            variant="ghost"
                                        />
                                    </Tooltip>
                                ) : null}
                                <Tooltip
                                    align="end"
                                    label={<BrowserImportHint sections={browserImportPolicy} />}
                                    placement="bottom"
                                >
                                    <Button
                                        aria-label="What gets imported"
                                        icon="question"
                                        iconOnly
                                        size="small"
                                        variant="ghost"
                                    />
                                </Tooltip>
                            </div>
                            {snapshot.pending && snapshot.progress ? (
                                <div className="happy-browser-import__progress">
                                    <progress
                                        aria-label={progressLabel}
                                        max={snapshot.progress.total || undefined}
                                        value={
                                            snapshot.progress.total > 0
                                                ? snapshot.progress.completed
                                                : undefined
                                        }
                                    />
                                    {snapshot.progress.total > 0 ? (
                                        <span>
                                            {snapshot.progress.completed} of{" "}
                                            {snapshot.progress.total}
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}
                            {snapshot.proposal && snapshot.proposal.sites.length > 0 ? (
                                <BrowserImportSites {...props} />
                            ) : !snapshot.loading ? (
                                <EmptyState
                                    description={
                                        snapshot.proposal
                                            ? "This profile has no supported session cookies or saved passwords. Try another profile or import a password CSV."
                                            : snapshot.catalog.profiles.length === 0
                                              ? "No supported browser profiles were found. You can still import an exported password CSV."
                                              : "Your source browser is only unlocked after you choose sites and start the import."
                                    }
                                    icon="globe"
                                    size="inline"
                                    title={
                                        snapshot.proposal
                                            ? "No supported sites"
                                            : snapshot.catalog.profiles.length === 0
                                              ? "No browser profiles found"
                                              : "Select a source profile"
                                    }
                                />
                            ) : null}
                        </>
                    )}
                </div>
            </Modal>
        </ModalOverlay>
    );
}
