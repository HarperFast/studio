import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../pipeline/pipeline';
import { successSpec } from '../../pipeline/success';
import type { AnalyticsDataPoint, TimeRange } from '../../types/analytics';

const window: TimeRange = { startTime: 0, endTime: 1_000_000 };

describe('success spec — runPipeline', () => {
	it('passes ratio through (count-weighted-mean across two records)', () => {
		// CWM ratio = (1000*0.99 + 10*0.10)/1010 = 991/1010 ≈ 0.9812.
		const records: AnalyticsDataPoint[] = [
			{ time: 1_000, node: 'n1', path: '/api/x', method: 'GET', ratio: 0.99, count: 1000, total: 990, period: 60_000 },
			{ time: 1_000, node: 'n1', path: '/api/x', method: 'GET', ratio: 0.10, count: 10, total: 1, period: 60_000 },
		];
		const out = runPipeline(successSpec, records, window, ['n1']);
		const x = out.series.find((s) => s.key === '/api/x')!;
		const y = x.points[0].y as number;
		expect(Math.abs(y - 0.9812) < 0.001, `expected ~0.9812, got ${y}`).toBeTruthy();
	});

	it('forwards thresholds through SeriesData (99.9% SLO, below-is-bad, minCount=1000)', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 1_000, node: 'n1', path: '/api/x', method: 'GET', ratio: 1, count: 100, period: 60_000 },
		];
		const out = runPipeline(successSpec, records, window, ['n1']);
		expect(out.thresholds?.length).toBe(1);
		const t = out.thresholds![0];
		expect(t.value).toBe(0.999);
		expect(t.direction).toBe('below-is-bad');
		expect(t.minCount).toBe(1000);
	});

	it('keeps top 10 paths + Other bucket', () => {
		const records: AnalyticsDataPoint[] = [];
		for (let i = 0; i < 12; i++) {
			const count = (12 - i) * 200;
			records.push({
				time: 1_000,
				node: 'n1',
				path: `/api/p${i}`,
				method: 'GET',
				total: count, // success ratio = total/count = 1.0
				count,
				period: 60_000,
			});
		}
		const out = runPipeline(successSpec, records, window, ['n1']);
		const keys = out.series.map((s) => s.key);
		expect(keys.includes('Other')).toBeTruthy();
		expect(keys.length).toBe(11);
	});

	it('synthesizes ratio from total/count when Harper omits the ratio field', () => {
		// Harper emits operation/fastify-route records with total+count but no
		// `ratio`. The pre-fix spec read `ratio` directly and dropped these
		// records silently (~34% of the fixture). Pin the fix.
		// count must be >= confidence.suppressBelow (100) so the series isn't
		// gated out — that's what would happen in production for a path with
		// real traffic.
		const records: AnalyticsDataPoint[] = [
			{ time: 1_000, node: 'n1', path: '/op', method: 'GET', total: 800, count: 1000, period: 60_000 } as any,
		];
		const out = runPipeline(successSpec, records, window, ['n1']);
		const op = out.series.find((s) => s.key === '/op');
		expect(op, 'records without ratio field still produce a series').toBeTruthy();
		expect(op!.points[0].y).toBe(0.8);
	});
});
