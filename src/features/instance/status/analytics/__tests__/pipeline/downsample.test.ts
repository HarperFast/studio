import { describe, expect, it } from 'vitest';
import {
	downsampleAggregator,
	downsampleDerivedSeriesData,
	downsamplePoints,
	isRateTransform,
} from '../../pipeline/downsample';
import type { SeriesData, SeriesPoint } from '../../types/analytics';

describe('isRateTransform', () => {
	it('detects a direct rate transform', () => {
		expect(isRateTransform({ kind: 'rate' })).toBe(true);
	});

	it('detects a rate nested in a compose', () => {
		expect(isRateTransform({ kind: 'compose', steps: [{ kind: 'scale', factor: 2 }, { kind: 'rate' }] })).toBe(true);
	});

	it('is false for undefined and for non-rate transforms', () => {
		expect(isRateTransform(undefined)).toBe(false);
		expect(isRateTransform({ kind: 'raw' })).toBe(false);
		expect(isRateTransform({ kind: 'ratio' })).toBe(false);
		expect(isRateTransform({ kind: 'scale', factor: 1000 })).toBe(false);
		expect(isRateTransform({ kind: 'compose', steps: [{ kind: 'raw' }, { kind: 'ratio' }] })).toBe(false);
	});
});

describe('downsampleAggregator', () => {
	it('collapses rate fields with mean whatever the spec says temporally', () => {
		// The whole point: a `sum` over per-second values must not re-sum across
		// time, or bytes-sent reads 3x high on a 5 min lattice.
		expect(downsampleAggregator('sum', { kind: 'rate' })).toBe('mean');
		expect(downsampleAggregator('max', { kind: 'rate' })).toBe('mean');
	});

	it('keeps sum for extensive (non-rate) quantities', () => {
		expect(downsampleAggregator('sum', undefined)).toBe('sum');
		expect(downsampleAggregator('sum', { kind: 'raw' })).toBe('sum');
	});

	it('preserves gauge aggregators', () => {
		expect(downsampleAggregator('max', undefined)).toBe('max');
		expect(downsampleAggregator('last', undefined)).toBe('last');
	});

	it('collapses percentiles with max so spikes survive a wide window', () => {
		// A p95-of-p95s is not a p95; of the two approximations, keep the worst
		// case rather than smoothing it away.
		expect(downsampleAggregator('p50', undefined)).toBe('max');
		expect(downsampleAggregator('p95', undefined)).toBe('max');
		expect(downsampleAggregator('p99', undefined)).toBe('max');
	});

	it('keeps count-weighted-mean count-weighted', () => {
		expect(downsampleAggregator('count-weighted-mean', undefined)).toBe('count-weighted-mean');
	});
});

describe('downsamplePoints', () => {
	const pts = (xs: number[], ys: number[], counts?: number[]): SeriesPoint[] =>
		xs.map((x, i) => ({ x, y: ys[i], ...(counts ? { count: counts[i] } : {}) }));

	it('folds 60s points onto a 300s lattice, round-to-nearest', () => {
		// Round-to-nearest, not floor — the same convention `snapToBucketTime`
		// uses, so coarse bucket times stay on a grid the other panels share.
		// 0/60k/120k round to 0; 180k/240k round up to 300k.
		const out = downsamplePoints(pts([0, 60_000, 120_000, 180_000, 240_000], [10, 20, 30, 40, 50]), 300_000, 'mean');
		expect(out.map((p) => p.x)).toEqual([0, 300_000]);
		expect(out.map((p) => p.y)).toEqual([20, 45]);
	});

	it('sums observation counts so confidence gating still sees the real total', () => {
		const out = downsamplePoints(pts([0, 60_000, 120_000], [1, 2, 3], [4, 5, 6]), 300_000, 'sum');
		expect(out.length).toBe(1);
		expect(out[0].count).toBe(15);
	});

	it('returns the original array untouched when nothing would fold', () => {
		// The 1h/6h presets already sit on the target lattice — identity, and
		// referentially so, to keep downstream memos stable.
		const input = pts([0, 60_000, 120_000], [1, 2, 3]);
		expect(downsamplePoints(input, 60_000, 'mean')).toBe(input);
	});

	it('is a no-op for a non-positive target or empty input', () => {
		const input = pts([0, 60_000], [1, 2]);
		expect(downsamplePoints(input, 0, 'mean')).toBe(input);
		expect(downsamplePoints([], 300_000, 'mean')).toEqual([]);
	});

	it('keeps an all-null coarse bucket as an explicit null gap', () => {
		const input: SeriesPoint[] = [
			{ x: 0, y: null },
			{ x: 60_000, y: null },
			{ x: 600_000, y: 5 },
		];
		const out = downsamplePoints(input, 300_000, 'mean');
		expect(out.map((p) => p.x)).toEqual([0, 600_000]);
		expect(out[0].y).toBeNull();
		expect(out[1].y).toBe(5);
	});

	it('ignores nulls when the bucket also holds real values', () => {
		const out = downsamplePoints([{ x: 0, y: null }, { x: 60_000, y: 10 }], 300_000, 'mean');
		expect(out[0].y).toBe(10);
	});

	it('lands coarse buckets on the same epoch-aligned grid as the fine snap', () => {
		const out = downsamplePoints(pts([300_000, 360_000, 600_000], [1, 2, 3]), 300_000, 'mean');
		expect(out.map((p) => p.x)).toEqual([300_000, 600_000]);
	});
});

describe('downsampleDerivedSeriesData', () => {
	const data: SeriesData = {
		series: [{ key: 'a', label: 'a', points: [{ x: 0, y: 10 }, { x: 60_000, y: 20 }] }],
	};

	it('defaults to mean — the shipped derived metrics are rates and ratios', () => {
		const out = downsampleDerivedSeriesData(data, 300_000);
		expect(out.series[0].points).toEqual([{ x: 0, y: 15 }]);
	});

	it('honors an explicit aggregator', () => {
		expect(downsampleDerivedSeriesData(data, 300_000, 'sum').series[0].points[0].y).toBe(30);
	});

	it('is idempotent — re-folding an already-coarse series changes nothing', () => {
		// MetricRenderer folds every derived recompute, including mqtt-traffic's
		// which already downsampled internally. That must not double-average.
		const once = downsampleDerivedSeriesData(data, 300_000);
		const twice = downsampleDerivedSeriesData(once, 300_000);
		expect(twice.series[0].points).toEqual(once.series[0].points);
	});

	it('folds the ceiling series too', () => {
		const withCeiling: SeriesData = {
			...data,
			ceiling: { key: 'rss', label: 'rss', points: [{ x: 0, y: 100 }, { x: 60_000, y: 200 }] },
		};
		const out = downsampleDerivedSeriesData(withCeiling, 300_000);
		expect(out.ceiling!.points).toEqual([{ x: 0, y: 150 }]);
	});
});
