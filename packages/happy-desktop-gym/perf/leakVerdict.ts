/**
 * The leak gym's verdict: a robust growth slope per metric, over the samples taken after warm-up.
 *
 * The slope is the Theil–Sen estimator (the median of every pairwise slope), whose 95% interval
 * comes from Kendall's rank statistic; a few outlying samples barely move either. A metric whose
 * slope crosses its threshold still passes as a plateau when the last stretch of the run is flat: a
 * cache filling to its bound grows early and stops, a leak keeps going.
 */

export interface LeakSample {
    /** Minutes since the measured phase began. */
    readonly minute: number;
    /** Actions the mix had run when the sample was taken. */
    readonly actions: number;
    readonly value: number;
}

export interface LeakMetric {
    readonly name: string;
    readonly unit: string;
    /** Growth per hour above which the metric fails. */
    readonly perHour: number;
    readonly samples: readonly LeakSample[];
}

export interface LeakVerdict {
    readonly name: string;
    readonly unit: string;
    readonly status: "PASS" | "PLATEAU" | "FAIL" | "NO DATA";
    readonly perHour: number;
    readonly low: number;
    readonly high: number;
    readonly latePerHour: number;
    readonly per1kActions: number;
    readonly start: number;
    readonly end: number;
    readonly threshold: number;
    readonly samples: number;
}

/** The last share of the run whose slope decides between a plateau and a leak. */
const LATE_SHARE = 0.4;

function theilSen(
    samples: readonly LeakSample[],
): { slope: number; low: number; high: number } | undefined {
    const slopes: number[] = [];
    const n = samples.length;
    for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
            const dt = samples[j]!.minute - samples[i]!.minute;
            if (dt > 0) slopes.push((samples[j]!.value - samples[i]!.value) / dt);
        }
    }
    if (slopes.length === 0) return undefined;
    slopes.sort((a, b) => a - b);
    const at = (index: number) =>
        slopes[Math.min(slopes.length - 1, Math.max(0, Math.round(index)))]!;
    const c = 1.96 * Math.sqrt((n * (n - 1) * (2 * n + 5)) / 18);
    return {
        slope: at((slopes.length - 1) / 2),
        low: at((slopes.length - c) / 2 - 1),
        high: at((slopes.length + c) / 2),
    };
}

const median = (values: readonly number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length === 0 ? Number.NaN : sorted[Math.floor((sorted.length - 1) / 2)]!;
};

export function leakVerdict(metric: LeakMetric): LeakVerdict {
    const { samples } = metric;
    const fit = theilSen(samples);
    const base = {
        name: metric.name,
        unit: metric.unit,
        samples: samples.length,
        threshold: metric.perHour,
    };
    if (fit === undefined || samples.length < 6) {
        return {
            ...base,
            end: Number.NaN,
            high: Number.NaN,
            latePerHour: Number.NaN,
            low: Number.NaN,
            per1kActions: Number.NaN,
            perHour: Number.NaN,
            start: Number.NaN,
            status: "NO DATA",
        };
    }
    const first = samples[0]!;
    const last = samples.at(-1)!;
    const lateFrom = last.minute - (last.minute - first.minute) * LATE_SHARE;
    const late = theilSen(samples.filter((s) => s.minute >= lateFrom));
    const minutes = last.minute - first.minute;
    const actionsPerMinute = minutes > 0 ? (last.actions - first.actions) / minutes : 0;
    const perHour = fit.slope * 60;
    const latePerHour = (late?.slope ?? fit.slope) * 60;
    const grows = perHour > metric.perHour && fit.low * 60 > 0;
    const status = !grows ? "PASS" : latePerHour <= metric.perHour / 2 ? "PLATEAU" : "FAIL";
    return {
        ...base,
        end: median(samples.slice(-3).map((s) => s.value)),
        high: fit.high * 60,
        latePerHour,
        low: fit.low * 60,
        per1kActions: actionsPerMinute > 0 ? (fit.slope / actionsPerMinute) * 1000 : Number.NaN,
        perHour,
        start: median(samples.slice(0, 3).map((s) => s.value)),
        status,
    };
}

const fixed = (value: number, digits = 1) =>
    Number.isFinite(value) ? (value >= 0 ? "+" : "") + value.toFixed(digits) : "n/a";

/** One line: `renderer heap  PASS  +0.4 MB/h (95% CI -1.2…+2.0) …`. */
export function leakVerdictLine(verdict: LeakVerdict): string {
    const unit = verdict.unit;
    const plain = (value: number) => (Number.isFinite(value) ? value.toFixed(1) : "n/a");
    return (
        `${verdict.name.padEnd(26)} ${verdict.status.padEnd(7)} ${fixed(verdict.perHour).padStart(8)} ${unit}/h ` +
        `(95% CI ${fixed(verdict.low)}…${fixed(verdict.high)}, last ${String(Math.round(LATE_SHARE * 100))}% ${fixed(verdict.latePerHour)}) ` +
        `${fixed(verdict.per1kActions, 2)} ${unit}/1k actions | ${plain(verdict.start)} → ${plain(verdict.end)} ${unit} | ` +
        `limit ${String(verdict.threshold)} ${unit}/h, ${String(verdict.samples)} samples`
    );
}
