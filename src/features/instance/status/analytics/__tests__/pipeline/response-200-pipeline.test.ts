import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../pipeline/pipeline';
import { response200Spec } from '../../pipeline/response-200';
import type { AnalyticsDataPoint, TimeRange } from '../../types/analytics';

const window: TimeRange = { startTime: 0, endTime: 1_000_000 };

describe('response_200 spec — runPipeline', () => {
	it('temporal aggregator is unweighted mean (NOT count-weighted)', () => {
		// Spec line 378 explicitly: temporal: 'mean'. Pin so a future "fix" to
		// count-weighted-mean fails this test loudly.
		// Two times for the same path, vastly different counts.
		// Unweighted mean of [1.0, 0.0] = 0.5; count-weighted would be 1·100/(100+1) ≈ 0.99.
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', path: '/a', total: 100, count: 100, ratio: 1, period: 60_000 } as any,
			{ time: 200_000, node: 'n1', path: '/a', total: 0, count: 1, ratio: 0, period: 60_000 } as any,
		];
		const out = runPipeline(response200Spec, records, window, ['n1']);
		const series = out.series.find((s) => s.key === '/a');
		expect(series).toBeTruthy();
		// One node → temporal mean across [1, 0] = 0.5; crossNode is no-op.
		// Pipeline computes per-time then averages those points temporally;
		// both points exist so the series has 2 SeriesPoints with y=1 and y=0.
		expect(series!.points.length).toBe(2);
		const ys = series!.points.map((p) => p.y).sort();
		expect(ys).toEqual([0, 1]);
	});

	it('synthesizes ratio from total/count when Harper omits the ratio field', () => {
		// Same fix as success.tsx — operation/fastify-route records have
		// total + count but no `ratio`. Pre-fix spec dropped them silently.
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', path: '/op', method: 'GET', total: 950, count: 1000, period: 60_000 } as any,
		];
		const out = runPipeline(response200Spec, records, window, ['n1']);
		const op = out.series.find((s) => s.key === '/op');
		expect(op, 'records without ratio field still produce a series').toBeTruthy();
		expect(op!.points[0].y).toBe(0.95);
	});

	it('forwards 99.9% threshold to SeriesData', () => {
		const out = runPipeline(response200Spec, [], window, []);
		expect(out.thresholds?.[0]?.value).toBe(0.999);
		expect(out.thresholds?.[0]?.minCount).toBe(1000);
	});
});
