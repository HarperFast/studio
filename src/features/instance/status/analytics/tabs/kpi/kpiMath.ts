// Pure math for the Health-tab KPI stat strip: collapse a pipeline SeriesData
// into one cluster-level point list, then reduce it to the tile's headline
// (latest bucket), window aggregate (mean of buckets), and the delta vs the
// previous window. Kept free of React/query imports so it unit-tests plain.

import type { SeriesData } from '../../types/analytics';

export interface KpiPoint {
	x: number;
	y: number;
}

/** How multi-series pipeline output folds into the tile's single line.
 *  `sum` is for breakdowns whose parts add up to a meaningful total (CPU
 *  harper + user scopes); `mean` for everything else (and a no-op for
 *  single-series field specs). */
export type KpiCombine = 'sum' | 'mean';

/** Collapse cluster-aggregate SeriesData into one point per time bucket.
 *  Non-finite ys are dropped; a bucket with no finite value across all
 *  series is omitted entirely (the sparkline connects across it). */
export function collapseSeries(data: SeriesData, combine: KpiCombine): KpiPoint[] {
	const byX = new Map<number, number[]>();
	for (const s of data.series) {
		for (const p of s.points) {
			if (typeof p.y === 'number' && Number.isFinite(p.y)) {
				let ys = byX.get(p.x);
				if (!ys) {
					ys = [];
					byX.set(p.x, ys);
				}
				ys.push(p.y);
			}
		}
	}
	return [...byX.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([x, ys]) => {
			const total = ys.reduce((a, b) => a + b, 0);
			return { x, y: combine === 'sum' ? total : total / ys.length };
		});
}

/** Headline value: the most recent bucket's y. Null when the window is empty. */
export function latestValue(points: KpiPoint[]): number | null {
	return points.length > 0 ? points[points.length - 1].y : null;
}

/** Window aggregate feeding the delta: plain mean of the bucket values.
 *  Buckets are period-spaced, so this approximates the time-mean without
 *  re-weighting. Null when the window is empty. */
export function windowMean(points: KpiPoint[]): number | null {
	if (points.length === 0) { return null; }
	return points.reduce((a, p) => a + p.y, 0) / points.length;
}

export interface KpiDelta {
	/** Relative change in percent: (current − previous) / |previous| × 100. */
	pct: number;
	direction: 'up' | 'down' | 'flat';
}

/** |pct| below this renders as 'flat' — a ±0.0% arrow is noise, not signal. */
const FLAT_EPSILON_PCT = 0.05;

/** Delta of the current window vs the previous window of equal length.
 *  Returns null when either window has no data, or when previous === 0 with
 *  a nonzero current (relative change is undefined — the tile shows no
 *  delta rather than an infinity). previous === current === 0 is a real
 *  "still zero" reading and reports flat 0%. */
export function computeDelta(current: number | null, previous: number | null): KpiDelta | null {
	if (current === null || previous === null) { return null; }
	if (!Number.isFinite(current) || !Number.isFinite(previous)) { return null; }
	if (previous === 0) {
		return current === 0 ? { pct: 0, direction: 'flat' } : null;
	}
	const pct = ((current - previous) / Math.abs(previous)) * 100;
	const direction = Math.abs(pct) < FLAT_EPSILON_PCT ? 'flat' : pct > 0 ? 'up' : 'down';
	return { pct, direction };
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Compact window-length label for the delta caption ("vs prev 6h").
 *  Whole hours up to 48h stay in hours so the 24h preset reads "24h";
 *  longer whole-day windows read in days; anything else rounds to minutes. */
export function formatWindowLabel(durationMs: number): string {
	if (durationMs % HOUR === 0 && durationMs <= 48 * HOUR) { return `${durationMs / HOUR}h`; }
	if (durationMs % DAY === 0) { return `${durationMs / DAY}d`; }
	return `${Math.max(1, Math.round(durationMs / MIN))}m`;
}
