// Bucket-by-window clamps. Per the SRE review: a 30d window with 1m buckets
// across N nodes and 50 tables is on the order of 11M rows and OOMs the tab.
// Each preset declares the densest bucket Harper should serve.

export interface TimePreset {
	id: TimePresetId;
	label: string;
	durationMs: number;
	/** Bucket for a panel-sized chart — sized so the window lands in
	 *  `PANEL_POINT_TARGET`. Also the `bucket_ms` hint sent to Harper. */
	bucketMs: number;
	/** Bucket when the chart is expanded to the near-fullscreen dialog, where
	 *  there is roughly 4x the horizontal room. Always ≤ `bucketMs`. */
	expandedBucketMs: number;
}

export type TimePresetId = '1h' | '6h' | '24h' | '7d' | '30d';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Points a panel-sized chart aims for. Above this the line is denser than the
 *  panel has pixels, so the extra samples cost payload and render time and buy
 *  nothing; the 1h preset undershoots because Harper's own aggregate period is
 *  60 s and there is no finer data to ask for. */
export const PANEL_POINT_TARGET = { min: 100, max: 200 } as const;

export const TIME_PRESETS: readonly TimePreset[] = [
	// bucketMs is chosen to land `durationMs / bucketMs` inside
	// PANEL_POINT_TARGET; expandedBucketMs gives the dialog ~3-4x the detail.
	//                                                              panel  expanded
	{ id: '1h', label: 'Last 1 hour', durationMs: HOUR, bucketMs: 1 * MIN, expandedBucketMs: 1 * MIN }, //   60    60
	{ id: '6h', label: 'Last 6 hours', durationMs: 6 * HOUR, bucketMs: 2 * MIN, expandedBucketMs: 1 * MIN }, // 180   360
	{ id: '24h', label: 'Last 24 hours', durationMs: DAY, bucketMs: 10 * MIN, expandedBucketMs: 5 * MIN }, // 144   288
	{ id: '7d', label: 'Last 7 days', durationMs: 7 * DAY, bucketMs: HOUR, expandedBucketMs: 15 * MIN }, // 168   672
	{ id: '30d', label: 'Last 30 days', durationMs: 30 * DAY, bucketMs: 4 * HOUR, expandedBucketMs: HOUR }, // 180   720
];

export const DEFAULT_PRESET_ID: TimePresetId = '1h';

export function getPreset(id: TimePresetId): TimePreset {
	const p = TIME_PRESETS.find((x) => x.id === id);
	if (!p) { throw new Error(`Unknown preset: ${id}`); }
	return p;
}

/** Human phrase for a bucket duration — "1 minute", "10 minutes", "4 hours".
 *  Drives the "by X" sub-label under each range option so the operator can see
 *  the resolution a window renders at (the server ignores our `bucket_ms`, so
 *  the panel resolution is `targetBucketMs`, i.e. the preset's `bucketMs`).
 *  Every shipped bucket is a whole number of minutes or hours; the seconds /
 *  raw-ms branches are just defensive for a future odd value. */
export function formatBucketLabel(bucketMs: number): string {
	const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
	if (bucketMs >= HOUR && bucketMs % HOUR === 0) { return plural(bucketMs / HOUR, 'hour'); }
	if (bucketMs >= MIN && bucketMs % MIN === 0) { return plural(bucketMs / MIN, 'minute'); }
	if (bucketMs >= 1000 && bucketMs % 1000 === 0) { return plural(bucketMs / 1000, 'second'); }
	return `${bucketMs} ms`;
}

/**
 * Densest bucket the charts should *render* for a window of `windowMs`.
 *
 * The same numbers the presets declare, looked up by duration instead of id.
 * That matters because `bucketMs` reaches the server as `bucket_ms` but is
 * otherwise unused client-side: builds that ignore the hint (harper-pro 5.1.22)
 * return rows at raw emission cadence, and the pipeline then buckets them onto
 * `spec.bucket.fallbackMs` — 60 s regardless of the selected window. A 30 d
 * window rendered 43 200 points instead of 720 (#1576 follow-up).
 *
 * Reading the same table by duration keeps one source of truth: StorageTab
 * aligns its trend grid to the context's `bucketMs` (#1514), so a preset-sized
 * window MUST resolve to exactly that preset's value or the two grids diverge
 * and crosshair sync breaks. `targetBucketMs` locks that (see timePresets.test).
 */
export function targetBucketMs(windowMs: number, opts?: { expanded?: boolean }): number {
	const pick = (p: TimePreset) => (opts?.expanded ? p.expandedBucketMs : p.bucketMs);
	const finest = pick(TIME_PRESETS[0]);
	if (!Number.isFinite(windowMs) || windowMs <= 0) { return finest; }
	for (const p of TIME_PRESETS) {
		// 1% slack: a live `endTime = Date.now()` bound makes the computed
		// window drift a few ms off the preset's exact duration.
		if (windowMs <= p.durationMs * 1.01) { return pick(p); }
	}
	// Past the widest preset, hold its points-per-window ratio rather than
	// falling back to the finest bucket and re-creating the density problem.
	const widest = TIME_PRESETS[TIME_PRESETS.length - 1];
	return Math.max(finest, Math.ceil(windowMs / (widest.durationMs / pick(widest))));
}

export interface RefreshOption {
	label: string;
	value: number;
}

export const REFRESH_OPTIONS: readonly RefreshOption[] = [
	{ label: 'Off', value: 0 },
	{ label: '30s', value: 30_000 },
	{ label: '60s', value: 60_000 },
	{ label: '5m', value: 300_000 },
];

export const DEFAULT_REFRESH_MS = 60_000;
