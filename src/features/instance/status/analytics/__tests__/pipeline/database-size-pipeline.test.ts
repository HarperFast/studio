import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../pipeline/pipeline';
import { wrapperMetrics } from '../../pipeline/wrapperMetrics';
import type { AnalyticsDataPoint, TimeRange } from '../../types/analytics';

const databaseSizeSpec = wrapperMetrics['database-size'].spec;

const window: TimeRange = { startTime: 0, endTime: 10_000_000 };

describe('database-size spec', () => {
	it('reads `id` as timestamp (no `time` field on records)', () => {
		// Records carry only `id`. With timestamp:'id' wired into the pipeline
		// these must NOT be dropped. Regression check.
		const records: AnalyticsDataPoint[] = [
			{ id: 1_000_000, node: 'n1', database: 'data', size: 1000 } as any,
			{ id: 2_000_000, node: 'n1', database: 'data', size: 2000 } as any,
		];
		const out = runPipeline(databaseSizeSpec, records, window, ['n1']);
		const data = out.series.find((s) => s.key === 'data');
		expect(data, 'data series produced (timestamp:id read)').toBeTruthy();
		expect(data!.points.length).toBe(2);
	});

	it('temporal aggregator is `last` — picks newest snapshot, not average', () => {
		// Spec line 365. Two snapshots at the same dim/time bucket would
		// reduce to the last item. We verify by giving distinct times so each
		// produces one point — the aggregator runs trivially per (dim, time, node).
		const records: AnalyticsDataPoint[] = [
			{ id: 1_000_000, node: 'n1', database: 'data', size: 100 } as any,
			{ id: 1_000_000, node: 'n1', database: 'data', size: 200 } as any, // newer record same bucket
		];
		const out = runPipeline(databaseSizeSpec, records, window, ['n1']);
		const data = out.series.find((s) => s.key === 'data');
		expect(data).toBeTruthy();
		expect(data!.points.length).toBe(1);
		// 'last' on the items array: with insertion order preserved, last pushed wins.
		expect(data!.points[0].y).toBe(200);
	});

	it('crossNode aggregator is sum — replicated DB total across nodes', () => {
		// Spec line 365: crossNode 'sum'. Two nodes both holding the same DB
		// at one time → series y = sum.
		const records: AnalyticsDataPoint[] = [
			{ id: 1_000_000, node: 'n1', database: 'data', size: 100 } as any,
			{ id: 1_000_000, node: 'n2', database: 'data', size: 200 } as any,
		];
		const out = runPipeline(databaseSizeSpec, records, window, ['n1', 'n2']);
		const data = out.series.find((s) => s.key === 'data');
		expect(data).toBeTruthy();
		expect(data!.points[0].y).toBe(300);
	});
});
