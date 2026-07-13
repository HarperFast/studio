import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../pipeline/pipeline';
import { tlsReusedSpec } from '../../pipeline/tls-reused';
import type { AnalyticsDataPoint, TimeRange } from '../../types/analytics';

const window: TimeRange = { startTime: 0, endTime: 1_000_000 };

describe('tls-reused spec — runPipeline', () => {
	it('groups by node and surfaces a series per node', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', total: 100, count: 200, ratio: 0.5, period: 60_000 } as any,
			{ time: 100_000, node: 'n2', total: 80, count: 200, ratio: 0.4, period: 60_000 } as any,
		];
		const out = runPipeline(tlsReusedSpec, records, window, ['n1', 'n2']);
		const keys = out.series.map((s) => s.key).sort();
		expect(keys).toEqual(['n1', 'n2']);
	});

	it('forwards thresholds to SeriesData', () => {
		const out = runPipeline(tlsReusedSpec, [], window, []);
		expect(out.thresholds?.[0]?.value).toBe(0.5);
		expect(out.thresholds?.[0]?.direction).toBe('below-is-bad');
	});
});
