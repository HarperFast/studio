import { describe, expect, it } from 'vitest';
import type { SeriesData } from '../../types/analytics';
import { collapseSeries, computeDelta, formatWindowLabel, latestValue, windowMean } from './kpiMath';

function seriesData(series: { key: string; dim?: string; points: { x: number; y: number | null }[] }[]): SeriesData {
	return { series: series.map((s) => ({ ...s, label: s.key })) };
}

describe('collapseSeries', () => {
	it('sums multiple series per bucket (CPU harper + user scopes)', () => {
		const data = seriesData([
			{ key: 'harper', points: [{ x: 1, y: 0.2 }, { x: 2, y: 0.3 }] },
			{ key: 'user', points: [{ x: 1, y: 0.1 }, { x: 2, y: 0.2 }] },
		]);
		expect(collapseSeries(data, 'sum')).toEqual([
			{ x: 1, y: expect.closeTo(0.3, 10) },
			{ x: 2, y: 0.5 },
		]);
	});

	it('means multiple series per bucket', () => {
		const data = seriesData([
			{ key: 'a', points: [{ x: 1, y: 10 }] },
			{ key: 'b', points: [{ x: 1, y: 30 }] },
		]);
		expect(collapseSeries(data, 'mean')).toEqual([{ x: 1, y: 20 }]);
	});

	it('drops null ys and omits buckets with no finite value', () => {
		const data = seriesData([
			{ key: 'a', points: [{ x: 1, y: null }, { x: 2, y: 4 }, { x: 3, y: Number.NaN }] },
		]);
		expect(collapseSeries(data, 'mean')).toEqual([{ x: 2, y: 4 }]);
	});

	it('sorts output by time even when series points interleave', () => {
		const data = seriesData([
			{ key: 'a', points: [{ x: 3, y: 3 }, { x: 1, y: 1 }] },
			{ key: 'b', points: [{ x: 2, y: 2 }] },
		]);
		expect(collapseSeries(data, 'mean').map((p) => p.x)).toEqual([1, 2, 3]);
	});

	it('returns [] for empty series data', () => {
		expect(collapseSeries(seriesData([]), 'sum')).toEqual([]);
	});

	it('includeDims excludes series outside the declared total', () => {
		const data = seriesData([
			{ key: 'harper', dim: 'harper', points: [{ x: 1, y: 0.2 }] },
			{ key: 'user', dim: 'user', points: [{ x: 1, y: 0.1 }] },
			// Profiler hot-location series — already counted inside the scopes.
			{ key: '/some/fn', dim: '/some/fn', points: [{ x: 1, y: 0.15 }] },
		]);
		expect(collapseSeries(data, 'sum', ['harper', 'user'])).toEqual([
			{ x: 1, y: expect.closeTo(0.3, 10) },
		]);
	});

	it('includeDims gaps a bucket missing an expected dim instead of summing partially', () => {
		const data = seriesData([
			{ key: 'harper', dim: 'harper', points: [{ x: 1, y: 0.2 }, { x: 2, y: 0.4 }] },
			{ key: 'user', dim: 'user', points: [{ x: 1, y: 0.1 }] },
		]);
		expect(collapseSeries(data, 'sum', ['harper', 'user'])).toEqual([
			{ x: 1, y: expect.closeTo(0.3, 10) },
		]);
	});
});

describe('latestValue / windowMean', () => {
	it('latestValue reads the last (most recent) bucket', () => {
		expect(latestValue([{ x: 1, y: 5 }, { x: 2, y: 7 }])).toBe(7);
	});

	it('both return null on an empty window', () => {
		expect(latestValue([])).toBeNull();
		expect(windowMean([])).toBeNull();
	});

	it('windowMean is the plain mean of bucket values', () => {
		expect(windowMean([{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 30 }])).toBe(20);
	});
});

describe('computeDelta', () => {
	it('is null when either window has no data', () => {
		expect(computeDelta(null, 10)).toBeNull();
		expect(computeDelta(10, null)).toBeNull();
		expect(computeDelta(null, null)).toBeNull();
	});

	it('computes signed relative change with direction', () => {
		expect(computeDelta(15, 10)).toEqual({ pct: 50, direction: 'up' });
		expect(computeDelta(5, 10)).toEqual({ pct: -50, direction: 'down' });
	});

	it('previous=0, current=0 → flat 0% (a real "still zero" reading)', () => {
		expect(computeDelta(0, 0)).toEqual({ pct: 0, direction: 'flat' });
	});

	it('previous=0 with nonzero current → null (relative change undefined)', () => {
		expect(computeDelta(5, 0)).toBeNull();
	});

	it('uses |previous| so a negative baseline keeps the sign of the change', () => {
		expect(computeDelta(-5, -10)).toEqual({ pct: 50, direction: 'up' });
	});

	it('treats sub-epsilon changes as flat', () => {
		const d = computeDelta(10.000001, 10);
		expect(d?.direction).toBe('flat');
	});

	it('rejects non-finite inputs', () => {
		expect(computeDelta(Infinity, 10)).toBeNull();
		expect(computeDelta(10, Number.NaN)).toBeNull();
	});
});

describe('formatWindowLabel', () => {
	const MIN = 60_000;
	const HOUR = 60 * MIN;
	const DAY = 24 * HOUR;

	it('formats the shipped presets compactly', () => {
		expect(formatWindowLabel(HOUR)).toBe('1h');
		expect(formatWindowLabel(6 * HOUR)).toBe('6h');
		expect(formatWindowLabel(DAY)).toBe('24h');
		expect(formatWindowLabel(7 * DAY)).toBe('7d');
		expect(formatWindowLabel(30 * DAY)).toBe('30d');
	});

	it('falls back to minutes for irregular windows', () => {
		expect(formatWindowLabel(2 * MIN)).toBe('2m');
		expect(formatWindowLabel(90 * MIN)).toBe('90m');
	});
});
