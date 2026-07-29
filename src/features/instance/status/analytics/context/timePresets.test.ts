import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PRESET_ID,
	DEFAULT_REFRESH_MS,
	formatBucketLabel,
	getPreset,
	PANEL_POINT_TARGET,
	REFRESH_OPTIONS,
	targetBucketMs,
	TIME_PRESETS,
	type TimePresetId,
} from './timePresets';

describe('timePresets', () => {
	it('exposes all five preset ids in stable order', () => {
		expect(TIME_PRESETS.map((p) => p.id)).toEqual(['1h', '6h', '24h', '7d', '30d']);
	});

	it('every preset has a positive duration and a positive bucket size', () => {
		for (const p of TIME_PRESETS) {
			expect(p.durationMs).toBeGreaterThan(0);
			expect(p.bucketMs).toBeGreaterThan(0);
		}
	});

	it('bucket is never larger than the window — every preset can produce ≥ 2 buckets', () => {
		for (const p of TIME_PRESETS) {
			expect(p.durationMs / p.bucketMs).toBeGreaterThanOrEqual(2);
		}
	});

	it('bucket monotonically grows (or stays equal) as the window widens', () => {
		// Densification: a longer window must not return more buckets than a
		// shorter one — that's the whole point of the bucket-by-window clamp.
		for (let i = 1; i < TIME_PRESETS.length; i++) {
			const prev = TIME_PRESETS[i - 1];
			const cur = TIME_PRESETS[i];
			expect(cur.bucketMs).toBeGreaterThanOrEqual(prev.bucketMs);
		}
	});

	it('caps the worst-case bucket count to keep payloads tractable', () => {
		// 30d × 1h = 720 buckets; 7d × 15m = 672; 24h × 5m = 288. None should
		// exceed ~1500 buckets — the SRE review's payload-blow-up mitigation.
		for (const p of TIME_PRESETS) {
			expect(p.durationMs / p.bucketMs).toBeLessThanOrEqual(1500);
		}
	});

	it('every preset lands a panel chart inside the point target', () => {
		// Above PANEL_POINT_TARGET.max the line is denser than the panel has
		// pixels — payload and render cost for nothing.
		for (const p of TIME_PRESETS) {
			const points = p.durationMs / p.bucketMs;
			expect(points, `${p.id} points`).toBeLessThanOrEqual(PANEL_POINT_TARGET.max);
			// 1h is the documented exception: Harper's own aggregate period is
			// 60 s, so there is no finer data to ask for and it undershoots.
			if (p.id !== '1h') {
				expect(points, `${p.id} points`).toBeGreaterThanOrEqual(PANEL_POINT_TARGET.min);
			}
		}
	});

	it('expanded buckets are finer than (or equal to) panel buckets', () => {
		for (const p of TIME_PRESETS) {
			expect(p.expandedBucketMs, p.id).toBeLessThanOrEqual(p.bucketMs);
			expect(p.expandedBucketMs, p.id).toBeGreaterThan(0);
		}
	});

	it('targetBucketMs reads the expanded column when asked', () => {
		for (const p of TIME_PRESETS) {
			expect(targetBucketMs(p.durationMs, { expanded: true }), p.id).toBe(p.expandedBucketMs);
			expect(targetBucketMs(p.durationMs, { expanded: false }), p.id).toBe(p.bucketMs);
		}
	});

	it('targetBucketMs agrees with the table it is derived from', () => {
		// The render lattice (targetBucketMs, looked up by duration) and the
		// server hint / StorageTab trend grid (preset.bucketMs, looked up by id)
		// must be the same number for a preset-sized window, or the Storage tab's
		// trend timestamps stop landing on the metric panels' and syncMethod
		// "value" crosshair sync silently breaks (#1514).
		for (const p of TIME_PRESETS) {
			expect(targetBucketMs(p.durationMs), p.id).toBe(p.bucketMs);
		}
	});

	it('targetBucketMs is monotonic in the window width', () => {
		let prev = 0;
		for (const p of TIME_PRESETS) {
			const cur = targetBucketMs(p.durationMs);
			expect(cur).toBeGreaterThanOrEqual(prev);
			prev = cur;
		}
	});

	it('getPreset returns the matching preset by id', () => {
		for (const id of ['1h', '6h', '24h', '7d', '30d'] as TimePresetId[]) {
			expect(getPreset(id).id).toBe(id);
		}
	});

	it('getPreset throws on an unknown id', () => {
		expect(() => getPreset('nope' as TimePresetId)).toThrow(/unknown preset/i);
	});

	it('exposes a sane default preset that exists in TIME_PRESETS', () => {
		expect(TIME_PRESETS.some((p) => p.id === DEFAULT_PRESET_ID)).toBe(true);
	});

	it('refresh options include Off and at least one positive cadence', () => {
		expect(REFRESH_OPTIONS.some((o) => o.value === 0)).toBe(true);
		expect(REFRESH_OPTIONS.some((o) => o.value > 0)).toBe(true);
	});

	it('default refresh is one of the offered options', () => {
		expect(REFRESH_OPTIONS.some((o) => o.value === DEFAULT_REFRESH_MS)).toBe(true);
	});

	it('default refresh is at least 30s — the SRE review pushed back on a 15s default', () => {
		expect(DEFAULT_REFRESH_MS).toBeGreaterThanOrEqual(30_000);
	});
});

describe('formatBucketLabel', () => {
	it('formats minutes and hours, singular vs plural', () => {
		expect(formatBucketLabel(60_000)).toBe('1 minute');
		expect(formatBucketLabel(2 * 60_000)).toBe('2 minutes');
		expect(formatBucketLabel(10 * 60_000)).toBe('10 minutes');
		expect(formatBucketLabel(60 * 60_000)).toBe('1 hour');
		expect(formatBucketLabel(4 * 60 * 60_000)).toBe('4 hours');
	});

	it('renders every shipped preset bucket as a clean minute/hour phrase', () => {
		// No preset should surface a raw-ms fallback in the picker.
		for (const p of TIME_PRESETS) {
			expect(formatBucketLabel(p.bucketMs), p.id).toMatch(/^\d+ (minute|hour)s?$/);
			expect(formatBucketLabel(p.expandedBucketMs), `${p.id} expanded`).toMatch(/^\d+ (minute|hour)s?$/);
		}
	});

	it('falls back to seconds / ms only for odd values', () => {
		expect(formatBucketLabel(30_000)).toBe('30 seconds');
		expect(formatBucketLabel(1500)).toBe('1500 ms');
	});
});

describe('preset-derived time range math', () => {
	function rangeFor(presetId: TimePresetId, now: number): { startTime: number; endTime: number } {
		const p = getPreset(presetId);
		return { startTime: now - p.durationMs, endTime: now };
	}

	it('window length equals the preset duration', () => {
		const now = 1_700_000_000_000;
		for (const p of TIME_PRESETS) {
			const r = rangeFor(p.id, now);
			expect(r.endTime - r.startTime).toBe(p.durationMs);
		}
	});

	it('endTime sits at "now" so the most recent buckets are always included', () => {
		const now = 1_700_000_000_000;
		expect(rangeFor('1h', now).endTime).toBe(now);
		expect(rangeFor('30d', now).endTime).toBe(now);
	});
});
