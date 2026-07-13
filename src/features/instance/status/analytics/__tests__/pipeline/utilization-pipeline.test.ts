import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../pipeline/pipeline';
import { utilizationSpec } from '../../pipeline/utilization';
import type { AnalyticsDataPoint, TimeRange } from '../../types/analytics';

const window: TimeRange = { startTime: 0, endTime: 1_000_000 };

describe('utilization spec', () => {
	it('crossNode aggregator is max — picks the worst-loaded node, not the average', () => {
		// Spec line 363: crossNode: 'max'. Two nodes at the same time:
		// n1=0.10 utilization (light load), n2=0.90 (hot). max = 0.90.
		// A regression to count-weighted-mean would yield ~0.5.
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', utilization: 0.10, count: 100, period: 60_000 } as any,
			{ time: 100_000, node: 'n2', utilization: 0.90, count: 100, period: 60_000 } as any,
		];
		const out = runPipeline(utilizationSpec, records, window, ['n1', 'n2']);
		// groupBy 'node' → two series; spec is per-node, so each series has its own value.
		expect(out.series.length).toBe(2);
		const n1 = out.series.find((s) => s.key === 'n1');
		const n2 = out.series.find((s) => s.key === 'n2');
		expect(n1!.points[0].y).toBe(0.10);
		expect(n2!.points[0].y).toBe(0.90);
	});
});
