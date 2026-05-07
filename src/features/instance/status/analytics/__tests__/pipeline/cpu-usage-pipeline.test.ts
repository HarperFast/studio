import { describe, expect, it } from 'vitest';
import { cpuUsageSpec } from '../../pipeline/cpu-usage.tsx';
import { runPipeline } from '../../pipeline/pipeline.ts';
import { QUANTILE_FIELDS } from '../../pipeline/quantileFields.ts';
import type { AnalyticsDataPoint, MetricSpec, TimeRange } from '../../types/analytics.ts';

const window: TimeRange = { startTime: 0, endTime: 1_000_000 };

// cpu-usage moved from the prior 3-panel small-multiples shape to a
// single-chart + chip + quantile-selector shape. The Renderer now swaps
// the field at runtime (DimensionSelectorRenderer's quantile path).
// Pin: every quantile in QUANTILE_FIELDS reads its own field correctly.
function specFor(field: string, label: string): MetricSpec {
	return {
		...cpuUsageSpec,
		series: { kind: 'groupBy', dimension: 'path', field: { field: field as any, label } },
	};
}

describe('cpu-usage spec — quantile field switching', () => {
	it('each quantile field reads its own column from the record', () => {
		// One record carrying distinct values across percentiles.
		const records: AnalyticsDataPoint[] = [
			{
				time: 100_000,
				node: 'n1',
				path: 'harper',
				p1: 0.1,
				p10: 1,
				p25: 5,
				median: 10,
				p75: 15,
				p90: 18,
				p95: 20,
				p99: 50,
				p999: 99,
				count: 100,
				period: 60_000,
			} as any,
		];
		const expected: Record<string, number> = {
			p1: 0.1,
			p10: 1,
			p25: 5,
			median: 10,
			p75: 15,
			p90: 18,
			p95: 20,
			p99: 50,
			p999: 99,
		};
		for (const q of QUANTILE_FIELDS) {
			const out = runPipeline(specFor(q.field, q.label), records, window, ['n1']);
			const harper = out.series.find((s) => s.key === 'harper')!;
			expect(harper, `q=${q.field}: harper series produced`).toBeTruthy();
			expect(harper!.points[0].y, `q=${q.field}`).toBe(expected[q.field]);
		}
	});

	it('count-weighted-mean groupBy series carry (approx) suffix on label', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', path: 'harper', median: 5, p95: 10, p99: 20, count: 100, period: 60_000 } as any,
		];
		const out = runPipeline(specFor('median', 'p50'), records, window, ['n1']);
		const harper = out.series.find((s) => s.key === 'harper')!;
		expect(harper).toBeTruthy();
		expect(harper!.label).toMatch(/\(approx\)$/);
	});
});
