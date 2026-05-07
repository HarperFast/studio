import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../pipeline/pipeline.ts';
import { storageVolumeSpec } from '../../pipeline/storage-volume.ts';
import type { AnalyticsDataPoint, TimeRange } from '../../types/analytics.ts';

const window: TimeRange = { startTime: 0, endTime: 10_000_000 };

describe('storage-volume spec', () => {
	it('plots `available` directly (NOT size − available)', () => {
		// Spec line 366. Regression guard: a "fix" reverting to size−available
		// (the pre-Step-6.5 implementation) would change y from 999 to 1.
		const records: AnalyticsDataPoint[] = [
			{ id: 1_000_000, node: 'n1', size: 1000, available: 999, free: 999 } as any,
		];
		const out = runPipeline(storageVolumeSpec, records, window, ['n1']);
		const n1 = out.series.find((s) => s.key === 'n1');
		expect(n1).toBeTruthy();
		expect(n1!.points[0].y).toBe(999);
	});

	it('reads `id` as timestamp', () => {
		const records: AnalyticsDataPoint[] = [
			{ id: 1_000_000, node: 'n1', size: 1000, available: 999 } as any,
			{ id: 2_000_000, node: 'n1', size: 1000, available: 800 } as any,
		];
		const out = runPipeline(storageVolumeSpec, records, window, ['n1']);
		const n1 = out.series.find((s) => s.key === 'n1');
		expect(n1).toBeTruthy();
		expect(n1!.points.length).toBe(2);
	});
});
