import { describe, expect, it } from 'vitest';
import { mainThreadUtilizationSpec } from '../../pipeline/main-thread-utilization.tsx';
import { runPipeline } from '../../pipeline/pipeline.ts';
import type { AnalyticsDataPoint, TimeRange } from '../../types/analytics.ts';

const window: TimeRange = { startTime: 0, endTime: 1_000_000 };

describe('main-thread-utilization spec — runPipeline', () => {
	it('default spec emits a utilization series via FieldExpr active / (active + idle)', () => {
		// active=25, idle=75 → utilization = 0.25.
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', active: 25, idle: 75, taskQueueLatency: 10, period: 60_000 } as any,
		];
		const out = runPipeline(mainThreadUtilizationSpec, records, window, ['n1']);
		// The post-Step pipeline emits one series per FieldSpec; default spec
		// has just the utilization field.
		const util = out.series[0];
		expect(util).toBeTruthy();
		expect(util.points[0].y).toBe(0.25);
	});

	it('utilization returns null when active+idle === 0 (div-by-zero guard)', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', active: 0, idle: 0, taskQueueLatency: 5, period: 60_000 } as any,
		];
		const out = runPipeline(mainThreadUtilizationSpec, records, window, ['n1']);
		const util = out.series[0];
		expect(util).toBeTruthy();
		// FieldExpr returns null when divisor is 0 → record dropped → no points.
		expect(util.points.length).toBe(0);
	});
});
