import {
    Fragment,
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type WheelEvent as ReactWheelEvent,
} from "react";
import { Icon } from "./Icon";
import { ScrollArea } from "./Scrollbar";
import { Octicon } from "./vectorIcons/VectorIcon";

export type ComposerModelEffort = {
    id: string;
    label: string;
};
export type ComposerModelChoice = {
    id: string;
    label: string;
    /** Every effort the model supports, least to most. Empty shows no effort. */
    efforts: readonly ComposerModelEffort[];
    /** The effort the model starts on when picked without one. */
    effort?: string;
    disabled?: boolean;
};
export type ComposerModelUsageWindow = {
    id: string;
    /** Short window name, such as "5h" or "Weekly". */
    label: string;
    /** Absent when the service has not reported it; shown as unknown, never as zero. */
    usedPercent?: number;
    /** Already-formatted reset moment, such as "resets 4:10 PM". */
    resets?: string;
};
export type ComposerModelAccountUsage = {
    /** The plan the service reports for the account, such as "Max". */
    plan?: string;
    windows: readonly ComposerModelUsageWindow[];
};
export type ComposerModelAccount = {
    id: string;
    label: string;
    /** The models this account offers, in catalog order. */
    models: readonly ComposerModelChoice[];
};
export type ComposerModelService = {
    id: string;
    label: string;
    /** The account whose models the service lists until another is picked. */
    account: string;
    accounts: readonly ComposerModelAccount[];
};
export type ComposerModelSelection = {
    service: string;
    account: string;
    model: string;
    effort?: string;
};
/**
 * Streams live account usage, keyed by account id, for as long as the account
 * list is open. The control calls it when the list appears and calls the
 * returned release when it goes, so nothing is read while nobody looks. An
 * account missing from the map has no reading and shows its usage as unknown.
 */
export type ComposerModelUsageWatch = (
    listener: (usage: ReadonlyMap<string, ComposerModelAccountUsage>) => void,
) => () => void;
/**
 * Transient states rendered directly, so a blueprint or test can show them
 * without driving a pointer. Each value only seeds the control's local state.
 */
export type ComposerModelControlPreview = {
    open?: boolean;
    /** The row shown as hovered, revealing its effort. */
    activeModel?: { service: string; model: string };
    /** Draws the active row's keyboard focus ring. */
    focusVisible?: boolean;
    /** Draws the active row's effort button as the pointer is over it. */
    effortHover?: boolean;
    /** Service whose account button is drawn as the pointer is over it. */
    accountButtonHover?: string;
    /** The row whose effort list is open. */
    efforts?: { service: string; model: string };
    /** Service whose account list is open. */
    accounts?: string;
    /** Account whose usage the account list shows. */
    accountHover?: string;
    /** Service whose account name carries the keyboard focus ring. */
    accountFocus?: string;
};
export type ComposerModelControlProps = {
    className?: string;
    "data-testid"?: string;
    disabled?: boolean;
    services: readonly ComposerModelService[];
    selection?: ComposerModelSelection;
    /**
     * A model, its account, its effort, or several changed. Picking from a list
     * closes the menu; stepping with horizontal scroll or arrow keys keeps it open.
     */
    onSelect?(selection: ComposerModelSelection): void;
    /** Must keep one identity while its source is unchanged: a new one restarts the watch. */
    usageWatch?: ComposerModelUsageWatch;
    preview?: ComposerModelControlPreview;
    style?: CSSProperties;
};

export const COMPOSER_MODEL_BENCHMARKS_URL = "https://happy.engineering/model-benchmarks";

/** Breathing room kept between the opened menu and the top of the window. */
const VIEWPORT_GAP = 16;
/** A long catalog scrolls rather than covering the conversation. */
const MENU_MAX_HEIGHT = 480;
/** Space between an inner list and the effort or account name it hangs from. */
const POPUP_GAP = 4;
/** A row's side padding: text ends this far inside its highlight. */
const ROW_INSET = 10;
/** Horizontal scroll that steps an effort or account once. */
const STEP_SCROLL = 48;
/** After a step, momentum still arriving from the same flick is ignored this long. */
const STEP_COOLDOWN = 140;
/** A pause this long between scroll events starts a new gesture. */
const GESTURE_IDLE = 200;
/** Firefox reports a wheel notch in lines. */
const WHEEL_LINE_HEIGHT = 16;

type Row = {
    key: string;
    service: string;
    account: string;
    model: ComposerModelChoice;
    selected: boolean;
};
type Popup = { kind: "efforts"; row: string } | { kind: "accounts"; service: string };

function rowKey(service: string, account: string, model: string) {
    return `${service}\n${account}\n${model}`;
}

/**
 * The menu hangs upwards from the composer, so how tall it may grow is only
 * knowable once it is placed: measure its anchored bottom edge and let it use
 * every pixel above it except one gap, scrolling only past that.
 */
function fitToViewport(node: HTMLDivElement | null) {
    if (node === null) return;
    const room = node.getBoundingClientRect().bottom - VIEWPORT_GAP;
    node.style.maxHeight = `${Math.max(96, Math.min(MENU_MAX_HEIGHT, room))}px`;
}

/**
 * Hangs an inner list from the name that opened it, its right edge on the edge
 * of that row's highlight: below the name when it fits inside the menu,
 * otherwise above it, where it grows upwards. A keyboard-opened list takes focus on its current choice.
 */
function placePopup(node: HTMLDivElement | null) {
    const menu = node?.parentElement;
    const anchor = menu?.querySelector<HTMLElement>("[data-popup-anchor]");
    if (!node || !menu || !anchor) return;
    const box = menu.getBoundingClientRect();
    const at = anchor.getBoundingClientRect();
    // A list that spans the rows (the accounts, with their usage) is placed by its stylesheet.
    if (node.dataset.popupSpan === undefined)
        node.style.right = `${box.right - menu.clientLeft - at.right - ROW_INSET}px`;
    const below = at.bottom + POPUP_GAP;
    if (below + node.offsetHeight <= box.bottom) {
        node.style.top = `${below - box.top - menu.clientTop}px`;
    } else {
        node.style.bottom = `${box.bottom - menu.clientTop - (at.top - POPUP_GAP)}px`;
    }
    if (document.activeElement === anchor)
        (
            node.querySelector<HTMLElement>('[aria-checked="true"]') ??
            node.querySelector<HTMLElement>('[data-menu-item="popup"]')
        )?.focus();
}

/** Horizontal scroll, or a vertical wheel with Shift, in pixels; 0 for plain vertical scroll. */
function horizontalDelta(event: ReactWheelEvent) {
    const scale = event.deltaMode === 1 ? WHEEL_LINE_HEIGHT : 1;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return event.deltaX * scale;
    return event.shiftKey ? event.deltaY * scale : 0;
}

function UsageWindow(props: { window: ComposerModelUsageWindow }) {
    const used = props.window.usedPercent;
    const known = used !== undefined;
    return (
        <div
            className="happy-composer-model-control__usage-window"
            data-happy-desktop-ui="composer-model-control-usage"
        >
            <div className="happy-composer-model-control__usage-head">
                <span className="happy-composer-model-control__usage-label">
                    {props.window.label}
                </span>
                {props.window.resets ? (
                    <span className="happy-composer-model-control__usage-resets">
                        {props.window.resets}
                    </span>
                ) : null}
                <span
                    className="happy-composer-model-control__usage-value"
                    data-unknown={known ? undefined : ""}
                >
                    {known ? `${Math.round(used)}%` : "unknown"}
                </span>
            </div>
            <div
                className="happy-composer-model-control__usage-bar"
                data-high={known && used >= 90 ? "" : undefined}
                data-unknown={known ? undefined : ""}
            >
                {known ? <span style={{ width: `${Math.max(0, Math.min(100, used))}%` }} /> : null}
            </div>
        </div>
    );
}

/**
 * C-145 ComposerModelControl — the composer's model pill. Its menu is one flat
 * list: each service's header names the account its models run on, and each
 * model row names its effort when it is chosen, hovered, or focused. The effort
 * and account names open their own small lists; horizontal scroll steps them in
 * place. Selection stays controlled; local state only holds the transient menu,
 * hover, and open list.
 */
export function ComposerModelControl(props: ComposerModelControlProps) {
    const preview = props.preview;
    const selection = props.selection;
    const [open, setOpen] = useState(preview?.open ?? false);
    /** Accounts picked for services that do not hold the selection; they only change the list. */
    const [accountShown, setAccountShown] = useState<ReadonlyMap<string, string>>(() => new Map());
    const accountOf = (service: ComposerModelService) =>
        service.id === selection?.service
            ? selection.account
            : (accountShown.get(service.id) ?? service.account);
    const previewRow = (target: { service: string; model: string } | undefined) => {
        const service = props.services.find((candidate) => candidate.id === target?.service);
        return target && service ? rowKey(service.id, accountOf(service), target.model) : null;
    };
    const [hoverRow, setHoverRow] = useState<string | null>(() => previewRow(preview?.activeModel));
    const [focusRow, setFocusRow] = useState<string | null>(() =>
        preview?.focusVisible ? previewRow(preview.activeModel) : null,
    );
    const [popup, setPopup] = useState<Popup | null>(() => {
        const efforts = previewRow(preview?.efforts);
        if (efforts !== null) return { kind: "efforts", row: efforts };
        return preview?.accounts ? { kind: "accounts", service: preview.accounts } : null;
    });
    const [accountHover, setAccountHover] = useState<string | null>(preview?.accountHover ?? null);
    const [liveUsage, setLiveUsage] = useState<ReadonlyMap<
        string,
        ComposerModelAccountUsage
    > | null>(null);
    const [remembered, setRemembered] = useState<ReadonlyMap<string, string>>(() => new Map());
    const gesture = useRef({ target: "", scrolled: 0, last: 0, cooldownUntil: 0 });
    const hasModels = props.services.some((service) =>
        service.accounts.some((account) => account.models.length > 0),
    );
    const usageWatch = props.usageWatch;
    // Identity contract: the watch runs exactly as long as the account list is
    // mounted, so this callback may only change when the watch itself does —
    // an ordinary re-render must not restart the owner's usage reads.
    const usageLease = useCallback(
        (node: HTMLDivElement | null) => {
            if (node === null || usageWatch === undefined) return;
            const release = usageWatch(setLiveUsage);
            return () => {
                release();
                setLiveUsage(null);
            };
        },
        [usageWatch],
    );
    // A removed catalog closes the picker; restoring it must not reopen an old menu.
    if (!hasModels && open) setOpen(false);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    // eslint-disable-next-line happy-react/no-layout-effect -- an open model menu owns a document-level outside-pointer listener that is attached after commit and completely removed when it closes
    useLayoutEffect(() => {
        if (!open) return;
        const outsidePointerDown = (event: PointerEvent) => {
            if (event.target instanceof Node && !root.current?.contains(event.target)) {
                setOpen(false);
                setPopup(null);
            }
        };
        document.addEventListener("pointerdown", outsidePointerDown, true);
        return () => document.removeEventListener("pointerdown", outsidePointerDown, true);
    }, [open]);

    const selectedService = props.services.find((service) => service.id === selection?.service);
    const selectedAccount = selectedService?.accounts.find(
        (account) => account.id === selection?.account,
    );
    const selectedModel = selectedAccount?.models.find((model) => model.id === selection?.model);
    const effortIndex = (row: Row) => {
        const ids = row.model.efforts.map((effort) => effort.id);
        const candidates = row.selected
            ? [selection?.effort, remembered.get(row.key), row.model.effort]
            : [remembered.get(row.key), row.model.effort];
        for (const candidate of candidates) {
            const index = candidate === undefined ? -1 : ids.indexOf(candidate);
            if (index >= 0) return index;
        }
        return 0;
    };
    const sections = props.services.map((service) => {
        const account = accountOf(service);
        const models = service.accounts.find((candidate) => candidate.id === account)?.models;
        const rows: Row[] = (models ?? []).map((model) => ({
            key: rowKey(service.id, account, model.id),
            service: service.id,
            account,
            model,
            selected:
                service.id === selection?.service &&
                account === selection.account &&
                model.id === selection.model,
        }));
        return { service, rows };
    });
    const selectedRow = sections.flatMap((section) => section.rows).find((row) => row.selected);
    const modelLabel = !hasModels
        ? "Models not configured"
        : (selectedModel?.label ?? selection?.model ?? "");
    const effortLabel = selectedRow
        ? selectedRow.model.efforts[effortIndex(selectedRow)]?.label
        : undefined;

    const close = () => {
        setOpen(false);
        setPopup(null);
        setHoverRow(null);
        setFocusRow(null);
    };
    /** Moves a row to an effort, which also makes its model the selected one. */
    const effortPick = (row: Row, index: number) => {
        const effort = row.model.efforts[index];
        if (effort === undefined || row.model.disabled) return;
        setRemembered((current) => new Map(current).set(row.key, effort.id));
        if (row.selected && effort.id === selection?.effort) return;
        props.onSelect?.({
            service: row.service,
            account: row.account,
            model: row.model.id,
            effort: effort.id,
        });
    };
    const effortStep = (row: Row, direction: number) => {
        const next = effortIndex(row) + direction;
        if (next >= 0 && next < row.model.efforts.length) effortPick(row, next);
    };
    const modelPick = (row: Row) => {
        if (row.model.disabled) return;
        if (!row.selected)
            props.onSelect?.({
                service: row.service,
                account: row.account,
                model: row.model.id,
                effort: row.model.efforts[effortIndex(row)]?.id,
            });
        close();
    };

    /**
     * An account without the selected model is not a silent substitute for it,
     * so it cannot be picked for the service that holds the selection.
     */
    const accountMissing = (service: ComposerModelService, account: ComposerModelAccount) =>
        service.id === selection?.service &&
        !account.models.some((model) => model.id === selection.model && !model.disabled);
    /**
     * Switching the account of the service that holds the selection moves the
     * selected model onto it; elsewhere it only changes which account's models
     * the service lists.
     */
    const accountApply = (service: ComposerModelService, account: ComposerModelAccount) => {
        if (accountMissing(service, account)) return;
        if (service.id !== selection?.service) {
            setAccountShown((current) => new Map(current).set(service.id, account.id));
            return;
        }
        if (account.id === selection.account) return;
        const model = account.models.find((candidate) => candidate.id === selection.model);
        const effort = model?.efforts.some((candidate) => candidate.id === selection.effort)
            ? selection.effort
            : undefined;
        props.onSelect?.({
            service: service.id,
            account: account.id,
            model: selection.model,
            effort,
        });
    };
    /** Steps to the neighbouring account that can be picked, stopping at either end. */
    const accountStep = (service: ComposerModelService, direction: number) => {
        const current = service.accounts.findIndex((account) => account.id === accountOf(service));
        for (
            let index = current + direction;
            index >= 0 && index < service.accounts.length;
            index += direction
        ) {
            const account = service.accounts[index]!;
            if (!accountMissing(service, account)) return accountApply(service, account);
        }
    };

    /**
     * Horizontal scroll steps one choice per 48px. After a step, momentum still
     * arriving from the same flick is dropped, so one flick moves one step.
     */
    const scrollStep = (event: ReactWheelEvent, target: string) => {
        const delta = horizontalDelta(event);
        if (delta === 0) return 0;
        const state = gesture.current;
        if (state.target !== target || event.timeStamp - state.last > GESTURE_IDLE) {
            state.target = target;
            state.scrolled = 0;
        }
        state.last = event.timeStamp;
        if (event.timeStamp < state.cooldownUntil) return 0;
        state.scrolled += delta;
        if (Math.abs(state.scrolled) < STEP_SCROLL) return 0;
        const direction = Math.sign(state.scrolled);
        state.scrolled = 0;
        state.cooldownUntil = event.timeStamp + STEP_COOLDOWN;
        return direction;
    };
    const arrowStep = (event: ReactKeyboardEvent) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return 0;
        event.preventDefault();
        return event.key === "ArrowRight" ? 1 : -1;
    };
    /** Up and Down walk the visible items of the menu, or of the open inner list. */
    const itemMove = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const from = event.target;
        const scope = from instanceof HTMLElement ? from.dataset.menuItem : undefined;
        if (!(from instanceof HTMLElement) || scope === undefined) return;
        event.preventDefault();
        const items = Array.from(
            root.current?.querySelectorAll<HTMLElement>(`[data-menu-item="${scope}"]`) ?? [],
        ).filter(
            (item) =>
                !(item as HTMLButtonElement).disabled &&
                getComputedStyle(item).visibility !== "hidden",
        );
        const next = items.indexOf(from) + (event.key === "ArrowDown" ? 1 : -1);
        items[Math.max(0, Math.min(items.length - 1, next))]?.focus();
    };
    const popupToggle = (next: Popup) =>
        setPopup((current) =>
            current?.kind === next.kind &&
            (current.kind === "efforts"
                ? current.row === (next as typeof current).row
                : current.service === (next as typeof current).service)
                ? null
                : next,
        );

    const renderRow = (row: Row) => {
        const efforts = row.model.efforts;
        const effortsOpen = popup?.kind === "efforts" && popup.row === row.key;
        // A row whose effort list is open stays revealed while the pointer is in the list.
        const active = hoverRow === row.key || focusRow === row.key || effortsOpen;
        const effort = efforts[effortIndex(row)];
        return (
            <div
                className="happy-composer-model-control__row"
                data-active={active ? "" : undefined}
                data-disabled={row.model.disabled ? "" : undefined}
                data-focus-visible={preview?.focusVisible && focusRow === row.key ? "" : undefined}
                data-happy-desktop-ui="composer-model-control-row"
                data-selected={row.selected ? "" : undefined}
                key={row.key}
                // A click anywhere on the row but its effort picks the model.
                onClick={() => modelPick(row)}
                onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                        setFocusRow((current) => (current === row.key ? null : current));
                }}
                onFocus={() => setFocusRow(row.key)}
                onKeyDown={(event) => {
                    const direction = arrowStep(event);
                    if (direction !== 0) effortStep(row, direction);
                }}
                onPointerEnter={() => {
                    if (!row.model.disabled) setHoverRow(row.key);
                }}
                onPointerLeave={() =>
                    setHoverRow((current) => (current === row.key ? null : current))
                }
                onWheel={(event) => {
                    if (row.model.disabled || efforts.length < 2) return;
                    const direction = scrollStep(event, row.key);
                    if (direction !== 0) effortStep(row, direction);
                }}
            >
                <button
                    aria-label={effort ? `${row.model.label}, ${effort.label}` : row.model.label}
                    aria-pressed={row.selected}
                    className="happy-composer-model-control__row-main"
                    data-menu-item="main"
                    disabled={row.model.disabled}
                    type="button"
                >
                    <span className="happy-composer-model-control__check">
                        {row.selected ? <Icon name="check" size={16} /> : null}
                    </span>
                    <span className="happy-composer-model-control__name">{row.model.label}</span>
                </button>
                {effort ? (
                    <span className="happy-composer-model-control__effort-column">
                        <button
                            aria-expanded={effortsOpen}
                            aria-haspopup="menu"
                            aria-label={`${row.model.label} effort: ${effort.label}`}
                            className="happy-composer-model-control__text-button happy-composer-model-control__effort-label"
                            data-happy-desktop-ui="composer-model-control-effort"
                            data-hover={active && preview?.effortHover ? "" : undefined}
                            data-menu-item="main"
                            data-popup-anchor={effortsOpen ? "" : undefined}
                            disabled={row.model.disabled}
                            onClick={(event) => {
                                event.stopPropagation();
                                popupToggle({ kind: "efforts", row: row.key });
                            }}
                            type="button"
                        >
                            {effort.label}
                        </button>
                    </span>
                ) : null}
            </div>
        );
    };

    const renderEfforts = (row: Row) => {
        const current = effortIndex(row);
        return (
            <div
                aria-label={`${row.model.label} effort`}
                className="happy-composer-model-control__popup happy-composer-model-control__efforts"
                data-happy-desktop-ui="composer-model-control-efforts"
                data-popup=""
                key={row.key}
                ref={placePopup}
                role="menu"
            >
                {row.model.efforts.map((effort, index) => (
                    <button
                        aria-checked={index === current}
                        className="happy-composer-model-control__option"
                        data-menu-item="popup"
                        key={effort.id}
                        onClick={() => {
                            effortPick(row, index);
                            close();
                        }}
                        role="menuitemradio"
                        type="button"
                    >
                        <span className="happy-composer-model-control__check">
                            {index === current ? <Icon name="check" size={16} /> : null}
                        </span>
                        <span className="happy-composer-model-control__name">{effort.label}</span>
                    </button>
                ))}
            </div>
        );
    };

    const usageOf = (account: ComposerModelAccount) => liveUsage?.get(account.id);
    const renderAccounts = (service: ComposerModelService) => {
        const shown =
            service.accounts.find((account) => account.id === accountHover) ??
            service.accounts.find((account) => account.id === accountOf(service));
        const shownUsage = shown ? usageOf(shown) : undefined;
        return (
            <div
                aria-label={`${service.label} account`}
                className="happy-composer-model-control__popup happy-composer-model-control__accounts"
                data-happy-desktop-ui="composer-model-control-accounts"
                data-popup=""
                data-popup-span=""
                key={service.id}
                ref={placePopup}
                role="menu"
            >
                <div className="happy-composer-model-control__account-list" ref={usageLease}>
                    {service.accounts.map((account) => {
                        const missing = accountMissing(service, account);
                        const plan = usageOf(account)?.plan;
                        const current = account.id === accountOf(service);
                        return (
                            <button
                                aria-checked={current}
                                aria-disabled={missing ? true : undefined}
                                className="happy-composer-model-control__option happy-composer-model-control__account"
                                data-happy-desktop-ui="composer-model-control-account"
                                data-menu-item="popup"
                                data-missing={missing ? "" : undefined}
                                data-shown={account.id === shown?.id ? "" : undefined}
                                key={account.id}
                                onClick={() => {
                                    if (missing) return;
                                    accountApply(service, account);
                                    // A switch that moved the selection is done; one that
                                    // only changed the listed models leaves them in view.
                                    if (service.id === selection?.service) close();
                                    else setPopup(null);
                                }}
                                onFocus={() => setAccountHover(account.id)}
                                onPointerEnter={() => setAccountHover(account.id)}
                                role="menuitemradio"
                                type="button"
                            >
                                <span className="happy-composer-model-control__check">
                                    {current ? <Icon name="check" size={16} /> : null}
                                </span>
                                <span className="happy-composer-model-control__name">
                                    {account.label}
                                </span>
                                {missing || plan ? (
                                    <span className="happy-composer-model-control__account-note">
                                        {missing
                                            ? `no ${selectedModel?.label ?? selection?.model}`
                                            : plan}
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
                {shown ? (
                    <div className="happy-composer-model-control__separator" role="separator" />
                ) : null}
                {shown ? (
                    <div className="happy-composer-model-control__usage">
                        {shownUsage === undefined || shownUsage.windows.length === 0 ? (
                            <UsageWindow window={{ id: "usage", label: "Usage" }} />
                        ) : (
                            shownUsage.windows.map((window) => (
                                <UsageWindow key={window.id} window={window} />
                            ))
                        )}
                    </div>
                ) : null}
            </div>
        );
    };

    const popupRow =
        popup?.kind === "efforts"
            ? sections.flatMap((section) => section.rows).find((row) => row.key === popup.row)
            : undefined;
    const popupService =
        popup?.kind === "accounts"
            ? props.services.find((service) => service.id === popup.service)
            : undefined;

    return (
        <div
            className={["happy-composer-model-control", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="composer-model-control"
            data-open={open ? "" : undefined}
            data-testid={props["data-testid"]}
            onKeyDown={(event) => {
                if (event.key !== "Escape" || !open) return;
                if (popup !== null) {
                    root.current?.querySelector<HTMLElement>("[data-popup-anchor]")?.focus();
                    setPopup(null);
                } else {
                    close();
                    trigger.current?.focus();
                }
            }}
            ref={root}
            style={props.style}
        >
            <button
                aria-expanded={hasModels ? open : undefined}
                aria-haspopup={hasModels ? "dialog" : undefined}
                aria-label={
                    hasModels
                        ? `Model: ${modelLabel}.${effortLabel ? ` Effort: ${effortLabel}.` : ""}`
                        : modelLabel
                }
                className="happy-composer-model-control__trigger"
                data-happy-desktop-ui="composer-model-control-trigger"
                data-empty={hasModels ? undefined : ""}
                disabled={props.disabled || !hasModels}
                onClick={() => (open ? close() : setOpen(true))}
                ref={trigger}
                type="button"
            >
                <span className="happy-composer-model-control__summary">
                    <span>{modelLabel}</span>
                    {hasModels && effortLabel ? (
                        <span className="happy-composer-model-control__effort">{effortLabel}</span>
                    ) : null}
                </span>
                {hasModels ? <Icon name="chevron-down" size={20} /> : null}
            </button>
            {hasModels && open ? (
                <div
                    aria-label="Model"
                    className="happy-composer-model-control__menu"
                    data-happy-desktop-ui="composer-model-control-menu"
                    onKeyDown={itemMove}
                    onPointerDown={(event) => {
                        // Pressing anywhere outside the open inner list and the name it hangs from closes it.
                        if (
                            popup !== null &&
                            event.target instanceof Element &&
                            !event.target.closest("[data-popup], [data-popup-anchor]")
                        )
                            setPopup(null);
                    }}
                    ref={fitToViewport}
                    role="dialog"
                >
                    <ScrollArea
                        className="happy-composer-model-control__list"
                        data-happy-desktop-ui="composer-model-control-list"
                        // The scrollbar floats over the rows, so a long list keeps the same text
                        // column as the footer below it.
                        placement="overlay"
                        viewportClassName="happy-composer-model-control__list-viewport"
                        viewportProps={{ onScroll: () => setPopup(null) }}
                    >
                        {sections.map(({ service, rows }, index) => {
                            const account = accountOf(service);
                            const accountsOpen =
                                popup?.kind === "accounts" && popup.service === service.id;
                            return (
                                <Fragment key={service.id}>
                                    {index > 0 ? (
                                        <div
                                            className="happy-composer-model-control__separator"
                                            role="separator"
                                        />
                                    ) : null}
                                    <div
                                        aria-label={service.label}
                                        className="happy-composer-model-control__service"
                                        data-happy-desktop-ui="composer-model-control-service"
                                        role="group"
                                    >
                                        <div
                                            className="happy-composer-model-control__service-header"
                                            data-service-header={service.id}
                                            onWheel={(event) => {
                                                const direction = scrollStep(event, service.id);
                                                if (direction !== 0)
                                                    accountStep(service, direction);
                                            }}
                                        >
                                            <span className="happy-composer-model-control__check" />
                                            <span className="happy-composer-model-control__service-name">
                                                {service.label}
                                            </span>
                                            <button
                                                aria-expanded={accountsOpen}
                                                aria-haspopup="menu"
                                                aria-label={`${service.label} account: ${
                                                    service.accounts.find(
                                                        (candidate) => candidate.id === account,
                                                    )?.label ?? account
                                                }`}
                                                className="happy-composer-model-control__text-button happy-composer-model-control__account-label"
                                                data-focus-visible={
                                                    preview?.accountFocus === service.id
                                                        ? ""
                                                        : undefined
                                                }
                                                data-happy-desktop-ui="composer-model-control-account-label"
                                                data-hover={
                                                    preview?.accountButtonHover === service.id
                                                        ? ""
                                                        : undefined
                                                }
                                                data-menu-item="main"
                                                data-popup-anchor={accountsOpen ? "" : undefined}
                                                onClick={() => {
                                                    setAccountHover(null);
                                                    popupToggle({
                                                        kind: "accounts",
                                                        service: service.id,
                                                    });
                                                }}
                                                onKeyDown={(event) => {
                                                    const direction = arrowStep(event);
                                                    if (direction !== 0)
                                                        accountStep(service, direction);
                                                }}
                                                type="button"
                                            >
                                                {service.accounts.find(
                                                    (candidate) => candidate.id === account,
                                                )?.label ?? account}
                                            </button>
                                        </div>
                                        {rows.map(renderRow)}
                                    </div>
                                </Fragment>
                            );
                        })}
                    </ScrollArea>
                    <div className="happy-composer-model-control__separator" role="separator" />
                    <a
                        className="happy-composer-model-control__benchmarks"
                        data-happy-desktop-ui="composer-model-control-benchmarks"
                        data-menu-item="main"
                        href={COMPOSER_MODEL_BENCHMARKS_URL}
                        onClick={close}
                        rel="noreferrer"
                        target="_blank"
                    >
                        <span className="happy-composer-model-control__check" />
                        <span className="happy-composer-model-control__name">
                            Latest benchmarks
                        </span>
                        <Octicon name="link-external" size={12} />
                    </a>
                    {popupRow ? renderEfforts(popupRow) : null}
                    {popupService ? renderAccounts(popupService) : null}
                </div>
            ) : null}
        </div>
    );
}
