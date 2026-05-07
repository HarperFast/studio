import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PRESET_ID,
	DEFAULT_REFRESH_MS,
	getPreset,
	REFRESH_OPTIONS,
	TIME_PRESETS,
	type TimePresetId,
} from './timePresets.ts';

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
