// Bucket-by-window clamps. Per the SRE review: a 30d window with 1m buckets
// across N nodes and 50 tables is on the order of 11M rows and OOMs the tab.
// Each preset declares the densest bucket Harper should serve.

export interface TimePreset {
	id: TimePresetId;
	label: string;
	durationMs: number;
	bucketMs: number;
}

export type TimePresetId = '1h' | '6h' | '24h' | '7d' | '30d';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const TIME_PRESETS: readonly TimePreset[] = [
	{ id: '1h', label: 'Last 1 hour', durationMs: HOUR, bucketMs: 1 * MIN },
	{ id: '6h', label: 'Last 6 hours', durationMs: 6 * HOUR, bucketMs: 1 * MIN },
	{ id: '24h', label: 'Last 24 hours', durationMs: DAY, bucketMs: 5 * MIN },
	{ id: '7d', label: 'Last 7 days', durationMs: 7 * DAY, bucketMs: 15 * MIN },
	{ id: '30d', label: 'Last 30 days', durationMs: 30 * DAY, bucketMs: HOUR },
];

export const DEFAULT_PRESET_ID: TimePresetId = '1h';

export function getPreset(id: TimePresetId): TimePreset {
	const p = TIME_PRESETS.find((x) => x.id === id);
	if (!p) { throw new Error(`Unknown preset: ${id}`); }
	return p;
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
export function targetBucketMs(windowMs: number): number {
	const finest = TIME_PRESETS[0].bucketMs;
	if (!Number.isFinite(windowMs) || windowMs <= 0) { return finest; }
	for (const p of TIME_PRESETS) {
		// 1% slack: a live `endTime = Date.now()` bound makes the computed
		// window drift a few ms off the preset's exact duration.
		if (windowMs <= p.durationMs * 1.01) { return p.bucketMs; }
	}
	// Past the widest preset, hold its points-per-window ratio rather than
	// falling back to the finest bucket and re-creating the density problem.
	const widest = TIME_PRESETS[TIME_PRESETS.length - 1];
	return Math.max(finest, Math.ceil(windowMs / (widest.durationMs / widest.bucketMs)));
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
