import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../pipeline/pipeline';
import { wrapperMetrics } from '../../pipeline/wrapperMetrics';
const transferSpec = wrapperMetrics['transfer'].spec;
import type { AnalyticsDataPoint, TimeRange } from '../../types/analytics';

const window: TimeRange = { startTime: 0, endTime: 1_000_000 };

describe('transfer spec — runPipeline', () => {
	it('groups by path and produces one series per path', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', path: '/a', method: 'GET', p95: 50, count: 100, period: 60_000 },
			{ time: 100_000, node: 'n1', path: '/b', method: 'GET', p95: 80, count: 100, period: 60_000 },
		];
		const out = runPipeline(transferSpec, records, window, ['n1']);
		const keys = out.series.map((s) => s.key).sort();
		expect(keys).toEqual(['/a', '/b']);
	});

	it('count-weighted-mean of p95 across records (with approx flag)', () => {
		// Spec L378-style intent: cwm(p95, count) = (50·100 + 100·100)/200 = 75.
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', path: '/a', p95: 50, count: 100, period: 60_000 } as any,
			{ time: 100_000, node: 'n2', path: '/a', p95: 100, count: 100, period: 60_000 } as any,
		];
		const out = runPipeline(transferSpec, records, window, ['n1', 'n2']);
		const a = out.series.find((s) => s.key === '/a')!;
		expect(a.points[0].y).toBe(75);
		// approx flag set since aggregator is count-weighted-mean of
		// percentiles. The flag is the load-bearing signal — label
		// suffix is a presentation concern covered separately by
		// approxLabel.test.ts.
		expect(a.approx).toBe(true);
	});

	it('keeps top 10 paths + Other bucket when more than 10 dims present', () => {
		const records: AnalyticsDataPoint[] = [];
		for (let i = 0; i < 12; i++) {
			records.push({
				time: 100_000,
				node: 'n1',
				path: `/p${i}`,
				p95: 50,
				count: (12 - i) * 200,
				period: 60_000,
			} as any);
		}
		const out = runPipeline(transferSpec, records, window, ['n1']);
		const keys = out.series.map((s) => s.key);
		expect(keys.includes('Other')).toBeTruthy();
		expect(keys.length).toBe(11);
	});
});
