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
