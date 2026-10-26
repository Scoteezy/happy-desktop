import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState, type ReactNode } from "react";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { Checkbox } from "../../Checkbox";
import { EmptyState } from "../../EmptyState";
import { FormRow } from "../../FormRow";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { ScrollArea } from "../../Scrollbar";
import { Spinner } from "../../Spinner";
import { browserImportMetadataSummary } from "../../browserImportMetadataSummary";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** Display metadata only. Password values never enter this component. */
export interface HappyAgentPasswordLogin {
    readonly id: string;
    readonly origin: string;
    readonly username: string;
    /** Already localized by the application boundary. */
    readonly updatedAt: string;
}

export interface HappyAgentPasswordImportSite {
    readonly origin: string;
    readonly usernames: readonly string[];
    readonly count: number;
}

export interface HappyAgentPasswordImportProposal {
    readonly sites: readonly HappyAgentPasswordImportSite[];
    readonly skipped: number;
}

export interface HappyAgentPasswordSettingsProps {
    readonly available: boolean;
    readonly loading?: boolean;
    readonly pending?: boolean;
    readonly error?: string;
    readonly logins: readonly HappyAgentPasswordLogin[];
    readonly proposal?: HappyAgentPasswordImportProposal;
    /** The owner starts every new proposal with an empty selection. */
    readonly selectedOrigins: ReadonlySet<string>;
    /** Opens the transient confirmation for restored/Blueprint state. */
    readonly initialRemoveLoginId?: string;
    /** Opens the native source-profile and selected-site import surface. */
    onBrowserImportChoose?(): void;
    onImportChoose(): void;
    onImportSiteSelect(origin: string, selected: boolean): void;
    onImportCommit(): void;
    onImportCancel(): void;
    onLoginRemove(id: string): void;
    onLoginReveal(id: string): void;
}

/** A bounded metadata list; focus stays mounted while the reader scrolls. */
function PasswordMetadataList<T>(props: {
    readonly items: readonly T[];
    readonly itemKey: (item: T) => string;
    readonly renderItem: (item: T) => ReactNode;
    readonly rowHeight: number;
    readonly label: string;
}) {
    const viewport = useRef<HTMLDivElement>(null);
    const pendingFocus = useRef<string | undefined>(undefined);
    const [focusedKey, focusedKeySet] = useState<string>();
    const focusedIndex = props.items.findIndex((item) => props.itemKey(item) === focusedKey);
    // TanStack Virtual owns mutable measurement methods, so this leaf stays
    // outside compiler memoization while its children remain compiler eligible.
    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: props.items.length,
        estimateSize: () => props.rowHeight,
        getItemKey: (index) => props.itemKey(props.items[index]!),
        getScrollElement: () => viewport.current,
        initialRect: { width: 0, height: 336 },
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
            aria-label={props.label}
            className="happy-agent-passwords__list"
            data-happy-desktop-ui="password-metadata-list"
            viewportRef={viewport}
        >
            <div
                className="happy-agent-passwords__list-inset"
                style={{ height: virtualizer.getTotalSize() + 8 }}
            >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                    const item = props.items[virtualRow.index]!;
                    const key = props.itemKey(item);
                    return (
                        <div
                            className="happy-agent-passwords__virtual-row"
                            data-happy-desktop-ui="password-metadata-row"
                            key={virtualRow.key}
                            onBlurCapture={(event) => {
                                if (!event.currentTarget.contains(event.relatedTarget))
                                    focusedKeySet(undefined);
                            }}
                            onFocusCapture={() => focusedKeySet(key)}
                            onKeyDown={(event) => {
                                let next: number;
                                if (event.key === "ArrowDown") next = virtualRow.index + 1;
                                else if (event.key === "ArrowUp") next = virtualRow.index - 1;
                                else if (event.key === "Home") next = 0;
                                else if (event.key === "End") next = props.items.length - 1;
                                else return;
                                const target = props.items[next];
                                if (!target) return;
                                event.preventDefault();
                                pendingFocus.current = props.itemKey(target);
                                focusedKeySet(pendingFocus.current);
                                virtualizer.scrollToIndex(next, { align: "auto" });
                            }}
                            ref={(element) => {
                                if (element && pendingFocus.current === key) {
                                    pendingFocus.current = undefined;
                                    element.querySelector<HTMLElement>("button, input")?.focus();
                                }
                            }}
                            style={{
                                height: virtualRow.size,
                                transform: `translateY(${String(virtualRow.start + 4)}px)`,
                            }}
                        >
                            {props.renderItem(item)}
                        </div>
                    );
                })}
            </div>
        </ScrollArea>
    );
}

/** Device-wide vault metadata, explicit site import, and native reveal actions. */
export function HappyAgentPasswordSettings(props: HappyAgentPasswordSettingsProps) {
    const [removeId, removeIdSet] = useState(props.initialRemoveLoginId);
    const removal = props.logins.find((login) => login.id === removeId);
    const busy = props.pending === true || props.loading === true;
    const disabled = !props.available || busy;
    const selectedSites =
        props.proposal?.sites.filter((site) => props.selectedOrigins.has(site.origin)) ?? [];
    const selectedLogins = selectedSites.reduce((total, site) => total + site.count, 0);
    const closeImport = () => {
        if (!props.pending) props.onImportCancel();
    };
    return (
        <div className="happy-agent-passwords" data-happy-desktop-ui="password-settings">
            {!props.available ? (
                <Banner tone="neutral" title="Open Happy Desktop to use passwords">
                    The encrypted password vault is available in Happy Desktop on macOS and Windows.
                    Chrome passwords on Windows require a CSV export because of Chrome’s app-bound
                    encryption.
                </Banner>
            ) : null}
            <HappyAgentSettingsSection>
                <FormRow
                    control={
                        <div className="happy-agent-passwords__import-actions">
                            {props.onBrowserImportChoose ? (
                                <Button
                                    disabled={disabled}
                                    icon="globe"
                                    onClick={props.onBrowserImportChoose}
                                >
                                    Import from browser
                                </Button>
                            ) : null}
                            <Button
                                disabled={disabled}
                                icon={props.onBrowserImportChoose ? undefined : "plus"}
                                onClick={props.onImportChoose}
                                variant={props.onBrowserImportChoose ? "secondary" : "primary"}
                            >
                                Import password CSV
                            </Button>
                        </div>
                    }
                    description="Choose a browser profile or password CSV, then select only the sites you want. Safari passwords and Windows Chrome passwords require a CSV export."
                    label="Saved passwords"
                    layout="stacked"
                />
            </HappyAgentSettingsSection>
            <p className="happy-agent-passwords__note">
                One encrypted vault on this device, shared by every network. Saved passwords stay on
                this device and are never sent to agents. Autofill requires your choice of a login
                on an exact HTTPS site match.
            </p>
            {props.error && !props.proposal ? (
                <Banner tone="danger" title="Password action could not finish">
                    {props.error}
                </Banner>
            ) : null}
            <div aria-live="polite" className="happy-agent-passwords__status" role="status">
                {busy ? <Spinner size={16} /> : null}
                {props.loading
                    ? "Reading password metadata…"
                    : props.pending
                      ? "Waiting for the secure desktop action…"
                      : `${String(props.logins.length)} saved ${props.logins.length === 1 ? "login" : "logins"}`}
            </div>
            {props.logins.length > 0 ? (
                <PasswordMetadataList
                    itemKey={(login) => login.id}
                    items={props.logins}
                    label="Saved login metadata"
                    renderItem={(login) => (
                        <article className="happy-agent-passwords__login">
                            <div className="happy-agent-passwords__identity">
                                <strong title={login.origin}>{login.origin}</strong>
                                <span title={`${login.username} · Updated ${login.updatedAt}`}>
                                    {login.username || "No username"} · Updated {login.updatedAt}
                                </span>
                            </div>
                            <div className="happy-agent-passwords__actions">
                                <Button
                                    disabled={disabled}
                                    icon="lock"
                                    onClick={() => props.onLoginReveal(login.id)}
                                    size="small"
                                    title="Authenticate with Touch ID or Windows Hello to show this password in a native window"
                                    variant="secondary"
                                >
                                    Show securely
                                </Button>
                                <Button
                                    disabled={disabled}
                                    onClick={() => removeIdSet(login.id)}
                                    size="small"
                                    variant="ghost"
                                >
                                    Remove
                                </Button>
                            </div>
                        </article>
                    )}
                    rowHeight={72}
                />
            ) : !props.loading ? (
                <EmptyState
                    description="Import selected sites or save a login from the workspace browser."
                    icon="lock"
                    size="inline"
                    title="No saved passwords"
                />
            ) : null}
            {props.proposal ? (
                <ModalOverlay onDismiss={closeImport}>
                    <Modal
                        footer={
                            <>
                                <Button
                                    disabled={props.pending}
                                    onClick={closeImport}
                                    variant="secondary"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    disabled={disabled || selectedSites.length === 0}
                                    onClick={props.onImportCommit}
                                >
                                    {props.pending
                                        ? "Importing…"
                                        : `Import ${String(selectedLogins)} ${selectedLogins === 1 ? "login" : "logins"}`}
                                </Button>
                            </>
                        }
                        icon="lock"
                        onClose={props.pending ? undefined : closeImport}
                        size="large"
                        title="Choose sites to import"
                    >
                        <div className="happy-agent-passwords">
                            <p className="happy-agent-passwords__note">
                                Select the sites whose passwords you want to bring into Happy.
                                Nothing is stored until you choose Import.
                            </p>
                            {props.error ? (
                                <Banner tone="danger" title="Import could not finish">
                                    {props.error}
                                </Banner>
                            ) : null}
                            {props.proposal.sites.length > 0 ? (
                                <PasswordMetadataList
                                    itemKey={(site) => site.origin}
                                    items={props.proposal.sites}
                                    label="Sites available for password import"
                                    renderItem={(site) => (
                                        <div className="happy-agent-passwords__site">
                                            <Checkbox
                                                aria-label={`Import passwords from ${site.origin}`}
                                                checked={props.selectedOrigins.has(site.origin)}
                                                disabled={disabled}
                                                onChange={(selected) =>
                                                    props.onImportSiteSelect(site.origin, selected)
                                                }
                                            />
                                            <div className="happy-agent-passwords__identity">
                                                <strong title={site.origin}>{site.origin}</strong>
                                                <span
                                                    title={browserImportMetadataSummary(
                                                        site.usernames,
                                                    )}
                                                >
                                                    {browserImportMetadataSummary(site.usernames) ||
                                                        "No username"}
                                                </span>
                                            </div>
                                            <span className="happy-agent-passwords__count">
                                                {site.count} {site.count === 1 ? "login" : "logins"}
                                            </span>
                                        </div>
                                    )}
                                    rowHeight={80}
                                />
                            ) : (
                                <EmptyState
                                    icon="lock"
                                    size="inline"
                                    title="No supported logins found"
                                />
                            )}
                            <p aria-live="polite" className="happy-agent-passwords__note">
                                {selectedSites.length} of {props.proposal.sites.length} sites
                                selected. {props.proposal.sites.length - selectedSites.length} sites
                                excluded. {props.proposal.skipped} unsupported or excluded entries
                                skipped.
                            </p>
                        </div>
                    </Modal>
                </ModalOverlay>
            ) : removal ? (
                <ModalOverlay onDismiss={() => removeIdSet(undefined)}>
                    <Modal
                        footer={
                            <>
                                <Button onClick={() => removeIdSet(undefined)} variant="secondary">
                                    Cancel
                                </Button>
                                <Button
                                    disabled={disabled}
                                    onClick={() => {
                                        props.onLoginRemove(removal.id);
                                        removeIdSet(undefined);
                                    }}
                                    variant="danger"
                                >
                                    Remove
                                </Button>
                            </>
                        }
                        icon="lock"
                        onClose={() => removeIdSet(undefined)}
                        size="small"
                        title="Remove saved login?"
                        tone="danger"
                    >
                        <p className="happy-agent-passwords__note">
                            Remove {removal.username || "the login"} for {removal.origin} from
                            Happy’s vault? The login in your source browser is unchanged.
                        </p>
                    </Modal>
                </ModalOverlay>
            ) : null}
        </div>
    );
}
