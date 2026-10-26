import type { Key } from "react";

/**
 * A diagnostic for preview and development builds: a virtual transcript row
 * is placed from the height its model predicts and is never measured, so a
 * prediction the paint disagrees with draws the next row over this one or
 * leaves a gap. With a reporter installed, `MessageList` observes each mounted
 * row and reports one whose painted height settles away from the prediction.
 * Nothing is installed in production, where no row is observed or measured,
 * and a report never corrects the layout.
 */

/** One mounted row whose painted height settled away from its predicted height. */
export type MessageListRowHeightMismatch = {
    /** The row's entry key, or `working-status` for the list's live footer. */
    readonly key: string;
    /** The row's position in the list. */
    readonly index: number;
    /** The row's painted width in CSS pixels. */
    readonly width: number;
    /** The height the list placed the next row from. */
    readonly predicted: number;
    /** The height the row painted. */
    readonly actual: number;
};

/** Differences below this are layout-unit rounding, not a missed line. */
const TOLERANCE = 1;
/** A row that animates, as a disclosure opening, passes through other heights. */
const SETTLE_MS = 400;

type ObservedRow = {
    key: string;
    index: number;
    predicted: number;
    timer: ReturnType<typeof setTimeout> | undefined;
};

let reporter: ((mismatch: MessageListRowHeightMismatch) => void) | undefined;
let observer: ResizeObserver | undefined;
const rows = new Map<HTMLElement, ObservedRow>();
const reported = new Set<string>();

function rowCheck(element: HTMLElement, row: ObservedRow): void {
    row.timer = undefined;
    if (!reporter || rows.get(element) !== row) return;
    const bounds = element.getBoundingClientRect();
    if (Math.abs(bounds.height - row.predicted) <= TOLERANCE) return;
    const mismatch: MessageListRowHeightMismatch = {
        actual: bounds.height,
        index: row.index,
        key: row.key,
        predicted: row.predicted,
        width: bounds.width,
    };
    /* One report for each distinct disagreement, not one per frame. */
    const identity = `${mismatch.key}:${String(mismatch.width)}:${String(mismatch.predicted)}:${String(mismatch.actual)}`;
    if (reported.has(identity)) return;
    reported.add(identity);
    reporter(mismatch);
}

function rowSchedule(element: HTMLElement): void {
    const row = rows.get(element);
    if (!row) return;
    if (row.timer !== undefined) clearTimeout(row.timer);
    row.timer = setTimeout(() => rowCheck(element, row), SETTLE_MS);
}

/**
 * Starts reporting rows whose painted height settles away from the predicted
 * one. Call it once, before the transcript renders, only in a preview or
 * development build; the returned function stops the check.
 */
export function messageListRowHeightCheckInstall(
    report: (mismatch: MessageListRowHeightMismatch) => void,
): () => void {
    reporter = report;
    return () => {
        if (reporter !== report) return;
        reporter = undefined;
        observer?.disconnect();
        observer = undefined;
        for (const row of rows.values()) if (row.timer !== undefined) clearTimeout(row.timer);
        rows.clear();
        reported.clear();
    };
}

/**
 * The ref a virtual row takes while the check is installed, or `undefined`
 * otherwise, so a production row carries no ref at all. A row re-rendered at
 * a new prediction is checked again against it.
 */
export function messageListRowHeightCheckRef(
    key: Key,
    index: number,
    predicted: number,
): ((element: HTMLDivElement | null) => (() => void) | undefined) | undefined {
    if (!reporter) return undefined;
    return (element) => {
        if (!element) return undefined;
        const targetWindow = element.ownerDocument.defaultView;
        if (!targetWindow?.ResizeObserver) return undefined;
        observer ??= new targetWindow.ResizeObserver((entries) => {
            for (const entry of entries) rowSchedule(entry.target as HTMLElement);
        });
        /* `Children.toArray` keys each child `.$` and its own key. */
        const id = String(key).replace(/^\.\$/u, "");
        rows.set(element, { index, key: id, predicted, timer: undefined });
        /* Observing delivers a first notification, which checks the new prediction. */
        observer.observe(element);
        return () => {
            const row = rows.get(element);
            if (row?.timer !== undefined) clearTimeout(row.timer);
            rows.delete(element);
            observer?.unobserve(element);
        };
    };
}
