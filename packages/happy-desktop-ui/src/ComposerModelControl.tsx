import {
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
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
    /** Every effort the model supports, least to most. Empty hides the slider. */
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
 * submenu is open. The control calls it when the submenu appears and calls the
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
    /** The row shown as hovered, revealing its slider. */
    activeModel?: { service: string; model: string };
    /** Draws the active row's keyboard focus ring. */
    focusVisible?: boolean;
    /** Service whose account submenu is open. */
    accounts?: string;
    /** Account whose usage the submenu shows. */
    accountHover?: string;
    /** Freezes the active row's bubble this far toward its next effort (-1 to 1, exclusive). */
    transit?: number;
};
export type ComposerModelControlProps = {
    className?: string;
    "data-testid"?: string;
    disabled?: boolean;
    services: readonly ComposerModelService[];
    selection?: ComposerModelSelection;
    /**
     * A model, its account, its effort, or several changed. The menu stays open
     * for effort and account changes.
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
/** Distance between two effort holes along the tube. */
const EFFORT_PITCH = 18;
/** Radius of the resting bubble. */
const BUBBLE_RADIUS = 6;
/** Clearance around the outer holes, so a squished bubble stays inside the slider. */
const SLIDER_PAD = BUBBLE_RADIUS + 1;
const SLIDER_HEIGHT = 20;
const SLIDER_MIDLINE = SLIDER_HEIGHT / 2;
/** Horizontal scroll that carries the bubble one hole along. */
const EFFORT_STEP_SCROLL = 48;
/** After a snap, momentum still arriving from the same flick is ignored this long. */
const EFFORT_SNAP_COOLDOWN = 140;
/** A bubble left between holes this long after the last scroll flows back. */
const EFFORT_RELEASE_DELAY = 120;
const EFFORT_RELEASE_DURATION = 160;
/** Firefox reports a wheel notch in lines. */
const WHEEL_LINE_HEIGHT = 16;

type Row = {
    key: string;
    service: string;
    account: string;
    model: ComposerModelChoice;
    selected: boolean;
};
type Transit = { row: string; progress: number };

function rowKey(service: string, account: string, model: string) {
    return `${service}\u0000${account}\u0000${model}`;
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

function holeCenter(index: number) {
    return SLIDER_PAD + index * EFFORT_PITCH;
}

function ellipsePath(cx: number, rx: number, ry: number) {
    const y = SLIDER_MIDLINE;
    return `M${cx - rx},${y} a${rx},${ry} 0 1,0 ${2 * rx},0 a${rx},${ry} 0 1,0 ${-2 * rx},0Z`;
}

/** Two drops joined by a waist: the bubble while it is pulled between two holes. */
function dropsPath(
    left: number,
    leftRadius: number,
    right: number,
    rightRadius: number,
    waist: number,
) {
    const y = SLIDER_MIDLINE;
    const middle = (left + right) / 2;
    const handle = (right - left) / 4;
    return [
        `M${left},${y - leftRadius}`,
        `C${left + handle},${y - leftRadius} ${middle - handle},${y - waist} ${middle},${y - waist}`,
        `C${middle + handle},${y - waist} ${right - handle},${y - rightRadius} ${right},${y - rightRadius}`,
        `A${rightRadius},${rightRadius} 0 0 1 ${right},${y + rightRadius}`,
        `C${right - handle},${y + rightRadius} ${middle + handle},${y + waist} ${middle},${y + waist}`,
        `C${middle - handle},${y + waist} ${left + handle},${y + leftRadius} ${left},${y + leftRadius}`,
        `A${leftRadius},${leftRadius} 0 0 1 ${left},${y - leftRadius}`,
        "Z",
    ].join(" ");
}

/**
 * The bubble's outline while the scroll has carried it `progress` of the way
 * toward the neighbouring hole. It keeps its volume: the leading edge runs
 * ahead and swells while the trailing drop thins and the waist pinches, so at
 * the snap it has nearly left its hole. Past either end the tube is closed and
 * the bubble flattens against it instead.
 */
function bubblePath(index: number, count: number, progress: number) {
    const origin = holeCenter(index);
    if (progress === 0) return ellipsePath(origin, BUBBLE_RADIUS, BUBBLE_RADIUS);
    const direction = Math.sign(progress);
    const amount = Math.min(Math.abs(progress), 0.999);
    const target = index + direction;
    if (target < 0 || target >= count) {
        const squish = 1 - (1 - amount) ** 2;
        return ellipsePath(
            origin + direction * 1.5 * squish,
            BUBBLE_RADIUS * (1 - 0.28 * squish),
            BUBBLE_RADIUS * (1 + 0.16 * squish),
        );
    }
    const moved = amount ** 1.4;
    const head = origin + direction * EFFORT_PITCH * (1 - (1 - amount) ** 2);
    const tail = origin + direction * EFFORT_PITCH * 0.3 * amount ** 2;
    const headRadius = BUBBLE_RADIUS * Math.sqrt(0.35 + 0.65 * moved);
    const tailRadius = BUBBLE_RADIUS * Math.sqrt(1 - 0.7 * moved);
    const waist = Math.min(headRadius, tailRadius) * (1 - 0.5 * amount);
    return direction > 0
        ? dropsPath(tail, tailRadius, head, headRadius, waist)
        : dropsPath(head, headRadius, tail, tailRadius, waist);
}

function reducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function EffortSlider(props: {
    efforts: readonly ComposerModelEffort[];
    index: number;
    label: string;
    onPick(index: number): void;
    progress: number;
    settle: number;
}) {
    const count = props.efforts.length;
    const width = 2 * SLIDER_PAD + (count - 1) * EFFORT_PITCH;
    const pointerPick = (event: ReactPointerEvent<HTMLDivElement>) => {
        const left = event.currentTarget.getBoundingClientRect().left;
        const index = Math.round((event.clientX - left - SLIDER_PAD) / EFFORT_PITCH);
        props.onPick(Math.max(0, Math.min(count - 1, index)));
    };
    return (
        <div
            aria-label={`${props.label} effort`}
            aria-valuemax={count - 1}
            aria-valuemin={0}
            aria-valuenow={props.index}
            aria-valuetext={props.efforts[props.index]?.label}
            className="happy-composer-model-control__slider"
            data-happy-desktop-ui="composer-model-control-slider"
            onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                pointerPick(event);
            }}
            onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) pointerPick(event);
            }}
            role="slider"
            style={{ width }}
            tabIndex={-1}
        >
            <svg
                aria-hidden="true"
                height={SLIDER_HEIGHT}
                viewBox={`0 0 ${width} ${SLIDER_HEIGHT}`}
                width={width}
            >
                <g className="happy-composer-model-control__track">
                    <rect
                        height={2}
                        rx={1}
                        width={(count - 1) * EFFORT_PITCH}
                        x={SLIDER_PAD}
                        y={SLIDER_MIDLINE - 1}
                    />
                    {props.efforts.map((effort, index) => (
                        <circle cx={holeCenter(index)} cy={SLIDER_MIDLINE} key={effort.id} r={3} />
                    ))}
                </g>
                <path
                    className="happy-composer-model-control__bubble"
                    d={bubblePath(props.index, count, props.progress)}
                    data-happy-desktop-ui="composer-model-control-bubble"
                    data-settle={props.settle > 0 ? "" : undefined}
                    // A new key per snap restarts the brief settle; a click never changes it.
                    key={props.settle}
                    style={{ transformOrigin: `${holeCenter(props.index)}px ${SLIDER_MIDLINE}px` }}
                />
            </svg>
        </div>
    );
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
 * model row carries its own effort slider. Selection stays controlled; local
 * state only holds the transient menu, hover, and scroll gesture.
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
    const previewRow = () => {
        const active = preview?.activeModel;
        const service = props.services.find((candidate) => candidate.id === active?.service);
        return active && service ? rowKey(service.id, accountOf(service), active.model) : null;
    };
    const [activeRow, setActiveRow] = useState<string | null>(previewRow);
    const [accountsFor, setAccountsFor] = useState<string | null>(preview?.accounts ?? null);
    const [accountHover, setAccountHover] = useState<string | null>(preview?.accountHover ?? null);
    const [liveUsage, setLiveUsage] = useState<ReadonlyMap<
        string,
        ComposerModelAccountUsage
    > | null>(null);
    const [remembered, setRemembered] = useState<ReadonlyMap<string, string>>(() => new Map());
    const [transit, setTransit] = useState<Transit | null>(() => {
        const row = previewRow();
        return row !== null && preview?.transit ? { row, progress: preview.transit } : null;
    });
    const [settle, setSettle] = useState<{ row: string; count: number } | null>(null);
    const gesture = useRef({
        row: "",
        scrolled: 0,
        progress: 0,
        cooldownUntil: 0,
        releaseTimer: 0,
        frame: 0,
    });
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
    // eslint-disable-next-line happy-react/no-layout-effect -- an open model menu owns a document-level outside-pointer listener that is attached after commit and completely removed when it closes
    useLayoutEffect(() => {
        if (!open) return;
        const outsidePointerDown = (event: PointerEvent) => {
            if (event.target instanceof Node && !root.current?.contains(event.target)) {
                setOpen(false);
                setAccountsFor(null);
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
    const selectedRow: Row | undefined =
        selectedService && selectedAccount && selectedModel
            ? {
                  key: rowKey(selectedService.id, selectedAccount.id, selectedModel.id),
                  service: selectedService.id,
                  account: selectedAccount.id,
                  model: selectedModel,
                  selected: true,
              }
            : undefined;
    const modelLabel = !hasModels
        ? "Models not configured"
        : (selectedModel?.label ?? selection?.model ?? "");
    const effortLabel = selectedRow
        ? selectedRow.model.efforts[effortIndex(selectedRow)]?.label
        : undefined;

    const close = () => {
        setOpen(false);
        setAccountsFor(null);
        setActiveRow(null);
    };
    /** Instantly moves a row to an effort, which also makes its model the selected one. */
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
    const modelPick = (row: Row) => {
        if (!row.selected)
            props.onSelect?.({
                service: row.service,
                account: row.account,
                model: row.model.id,
                effort: remembered.get(row.key),
            });
        close();
    };
    /** A bubble left between holes flows back into the one it came from. */
    const release = () => {
        const state = gesture.current;
        const from = state.progress;
        state.scrolled = 0;
        if (from === 0) return;
        let start: number | undefined;
        const frame = (now: number) => {
            start ??= now;
            const t = Math.min(1, (now - start) / EFFORT_RELEASE_DURATION);
            // Scroll arriving mid-release resumes from wherever the bubble is.
            state.progress = t < 1 ? from * (1 - t) ** 3 : 0;
            state.scrolled = state.progress * EFFORT_STEP_SCROLL;
            setTransit(t < 1 ? { row: state.row, progress: state.progress } : null);
            if (t < 1) state.frame = requestAnimationFrame(frame);
        };
        state.frame = requestAnimationFrame(frame);
    };
    /**
     * Horizontal scroll over a row slides its bubble. The distance accumulates
     * toward one step; reaching it snaps the bubble into the next hole, and any
     * surplus plus the momentum of the same flick is dropped, so one gesture
     * moves one step unless the scroll really continues.
     */
    const rowWheel = (event: ReactWheelEvent<HTMLDivElement>, row: Row) => {
        const scale = event.deltaMode === 1 ? WHEEL_LINE_HEIGHT : 1;
        const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
        const delta = (horizontal ? event.deltaX : event.shiftKey ? event.deltaY : 0) * scale;
        const count = row.model.efforts.length;
        if (delta === 0 || count < 2 || row.model.disabled) return;
        const state = gesture.current;
        cancelAnimationFrame(state.frame);
        window.clearTimeout(state.releaseTimer);
        if (state.row !== row.key) {
            state.row = row.key;
            state.scrolled = 0;
        }
        state.releaseTimer = window.setTimeout(release, EFFORT_RELEASE_DELAY);
        if (event.timeStamp < state.cooldownUntil) return;
        const index = effortIndex(row);
        const scrolled = state.scrolled + delta;
        const direction = Math.sign(scrolled);
        const target = index + direction;
        if (Math.abs(scrolled) >= EFFORT_STEP_SCROLL && target >= 0 && target < count) {
            state.scrolled = 0;
            state.progress = 0;
            state.cooldownUntil = event.timeStamp + EFFORT_SNAP_COOLDOWN;
            setTransit(null);
            setSettle((current) => ({
                row: row.key,
                count: current?.row === row.key ? current.count + 1 : 1,
            }));
            effortPick(row, target);
            return;
        }
        // Against a closed end the scroll keeps pressing without ever snapping.
        state.scrolled = Math.max(
            -EFFORT_STEP_SCROLL + 1,
            Math.min(EFFORT_STEP_SCROLL - 1, scrolled),
        );
        state.progress = reducedMotion() ? 0 : state.scrolled / EFFORT_STEP_SCROLL;
        setTransit(state.progress === 0 ? null : { row: row.key, progress: state.progress });
    };
    /** Up and Down walk the menu's headers and rows, skipping disabled models. */
    const itemMove = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const items = Array.from(
            root.current?.querySelectorAll<HTMLElement>("[data-menu-item]:not(:disabled)") ?? [],
        );
        const next = items.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : -1);
        items[Math.max(0, Math.min(items.length - 1, next))]?.focus();
    };
    const rowKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, row: Row) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return itemMove(event);
        event.preventDefault();
        effortPick(row, effortIndex(row) + (event.key === "ArrowRight" ? 1 : -1));
    };

    const renderRow = (row: Row) => {
        const efforts = row.model.efforts;
        const active = activeRow === row.key;
        const index = effortIndex(row);
        return (
            <div
                className="happy-composer-model-control__row"
                data-active={active ? "" : undefined}
                data-disabled={row.model.disabled ? "" : undefined}
                data-focus-visible={active && preview?.focusVisible ? "" : undefined}
                data-happy-desktop-ui="composer-model-control-row"
                data-selected={row.selected ? "" : undefined}
                key={row.key}
                onPointerEnter={() => {
                    if (!row.model.disabled) setActiveRow(row.key);
                }}
                onPointerLeave={(event) => {
                    if (!event.currentTarget.contains(document.activeElement))
                        setActiveRow((current) => (current === row.key ? null : current));
                }}
                onWheel={(event) => rowWheel(event, row)}
            >
                <button
                    aria-label={
                        efforts.length > 0
                            ? `${row.model.label}, ${efforts[index]?.label}`
                            : row.model.label
                    }
                    aria-pressed={row.selected}
                    className="happy-composer-model-control__row-main"
                    data-menu-item=""
                    disabled={row.model.disabled}
                    onBlur={() => setActiveRow((current) => (current === row.key ? null : current))}
                    onClick={() => modelPick(row)}
                    onFocus={() => setActiveRow(row.key)}
                    onKeyDown={(event) => rowKeyDown(event, row)}
                    type="button"
                >
                    <span className="happy-composer-model-control__check">
                        {row.selected ? <Icon name="check" size={16} /> : null}
                    </span>
                    <span className="happy-composer-model-control__name">{row.model.label}</span>
                </button>
                {efforts.length > 0 ? (
                    <>
                        <EffortSlider
                            efforts={efforts}
                            index={index}
                            label={row.model.label}
                            onPick={(next) => {
                                if (next !== index) effortPick(row, next);
                            }}
                            progress={transit?.row === row.key ? transit.progress : 0}
                            settle={settle?.row === row.key ? settle.count : 0}
                        />
                        <span className="happy-composer-model-control__effort-label">
                            {efforts[index]?.label}
                        </span>
                    </>
                ) : null}
            </div>
        );
    };

    const accountsService = props.services.find((service) => service.id === accountsFor);
    const usageOf = (account: ComposerModelAccount) => liveUsage?.get(account.id);
    /**
     * Picking an account for the service that holds the selection moves the
     * selected model onto it; elsewhere it only changes which account's models
     * the service lists. An account without the selected model is not a
     * silent substitute for it, so it cannot be picked.
     */
    const accountMissing = (service: ComposerModelService, account: ComposerModelAccount) =>
        service.id === selection?.service &&
        !account.models.some((model) => model.id === selection.model && !model.disabled);
    const accountPick = (service: ComposerModelService, account: ComposerModelAccount) => {
        if (accountMissing(service, account)) return;
        setAccountsFor(null);
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
    const renderAccounts = (service: ComposerModelService) => {
        const shown =
            service.accounts.find((account) => account.id === accountHover) ??
            service.accounts.find((account) => account.id === accountOf(service));
        const shownUsage = shown ? usageOf(shown) : undefined;
        return (
            <div
                aria-label={`${service.label} account`}
                className="happy-composer-model-control__accounts"
                data-happy-desktop-ui="composer-model-control-accounts"
                key={service.id}
                // Hangs beside its header row, kept inside the menu's height. Its first
                // 32px account row centres on the 28px header: 6px padding plus 2px.
                ref={(node) => {
                    const menu = node?.parentElement;
                    if (!node || !menu) return;
                    const header = menu.querySelector(
                        `[data-service-header="${CSS.escape(service.id)}"]`,
                    );
                    const menuTop = menu.getBoundingClientRect().top;
                    const wanted = header ? header.getBoundingClientRect().top - menuTop - 8 : 0;
                    const lowest = menu.offsetHeight - node.offsetHeight;
                    node.style.top = `${Math.max(0, Math.min(wanted, lowest))}px`;
                }}
                role="menu"
            >
                <div className="happy-composer-model-control__account-list" ref={usageLease}>
                    {service.accounts.map((account) => {
                        const missing = accountMissing(service, account);
                        const plan = usageOf(account)?.plan;
                        return (
                            <button
                                aria-checked={account.id === accountOf(service)}
                                aria-disabled={missing ? true : undefined}
                                className="happy-composer-model-control__account"
                                data-happy-desktop-ui="composer-model-control-account"
                                data-missing={missing ? "" : undefined}
                                data-shown={account.id === shown?.id ? "" : undefined}
                                key={account.id}
                                onClick={() => accountPick(service, account)}
                                onFocus={() => setAccountHover(account.id)}
                                onPointerEnter={() => setAccountHover(account.id)}
                                role="menuitemradio"
                                type="button"
                            >
                                <span className="happy-composer-model-control__check">
                                    {account.id === accountOf(service) ? (
                                        <Icon name="check" size={16} />
                                    ) : null}
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

    return (
        <div
            className={["happy-composer-model-control", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="composer-model-control"
            data-open={open ? "" : undefined}
            data-testid={props["data-testid"]}
            onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                if (accountsFor !== null) setAccountsFor(null);
                else close();
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
                    ref={fitToViewport}
                    role="dialog"
                >
                    <ScrollArea
                        className="happy-composer-model-control__list"
                        data-happy-desktop-ui="composer-model-control-list"
                        viewportClassName="happy-composer-model-control__list-viewport"
                    >
                        {props.services.map((service) => (
                            <div
                                aria-label={service.label}
                                className="happy-composer-model-control__service"
                                data-happy-desktop-ui="composer-model-control-service"
                                key={service.id}
                                role="group"
                            >
                                <button
                                    aria-expanded={accountsFor === service.id}
                                    aria-haspopup="menu"
                                    className="happy-composer-model-control__service-header"
                                    data-menu-item=""
                                    data-service-header={service.id}
                                    onClick={() => {
                                        setAccountHover(null);
                                        setAccountsFor((current) =>
                                            current === service.id ? null : service.id,
                                        );
                                    }}
                                    onKeyDown={itemMove}
                                    type="button"
                                >
                                    <span className="happy-composer-model-control__service-name">
                                        {service.label}
                                    </span>
                                    <span className="happy-composer-model-control__service-account">
                                        {service.accounts.find(
                                            (account) => account.id === accountOf(service),
                                        )?.label ?? accountOf(service)}
                                    </span>
                                    <Icon name="chevron-right" size={16} />
                                </button>
                                {(
                                    service.accounts.find(
                                        (account) => account.id === accountOf(service),
                                    )?.models ?? []
                                ).map((model) =>
                                    renderRow({
                                        key: rowKey(service.id, accountOf(service), model.id),
                                        service: service.id,
                                        account: accountOf(service),
                                        model,
                                        selected:
                                            service.id === selection?.service &&
                                            accountOf(service) === selection.account &&
                                            model.id === selection.model,
                                    }),
                                )}
                            </div>
                        ))}
                    </ScrollArea>
                    <div className="happy-composer-model-control__separator" role="separator" />
                    <a
                        className="happy-composer-model-control__benchmarks"
                        data-happy-desktop-ui="composer-model-control-benchmarks"
                        href={COMPOSER_MODEL_BENCHMARKS_URL}
                        onClick={close}
                        rel="noreferrer"
                        target="_blank"
                    >
                        <span>Latest benchmarks</span>
                        <Octicon name="link-external" size={12} />
                    </a>
                    {accountsService ? renderAccounts(accountsService) : null}
                </div>
            ) : null}
        </div>
    );
}
