import { describe, expect, it } from 'vitest';
import { memorySpec } from '../../pipeline/memory.tsx';
import { runPipeline } from '../../pipeline/pipeline.ts';
import type { AnalyticsDataPoint, TimeRange } from '../../types/analytics.ts';

const window: TimeRange = { startTime: 0, endTime: 1_000_000 };

describe('memory spec — runPipeline', () => {
	it('emits one series per FieldSpec with the configured label', () => {
		const records: AnalyticsDataPoint[] = [
			{
				time: 100_000,
				node: 'n1',
				heapUsed: 1,
				heapTotal: 2,
				external: 3,
				arrayBuffers: 4,
				count: 1,
				period: 60_000,
			} as any,
		];
		const out = runPipeline(memorySpec, records, window, ['n1']);
		const labels = out.series.map((s) => s.label).sort();
		expect(labels).toEqual(['arrayBuffers', 'external', 'heap total', 'heap used']);
	});

	it('temporal aggregator is `last` — preserves spike, not smeared', () => {
		// Same time bucket → 'last' picks the most recent record's value.
		// `mean` would average to 1.5; we want 2 (the spike).
		const records: AnalyticsDataPoint[] = [
			{
				time: 100_000,
				node: 'n1',
				heapUsed: 1,
				heapTotal: 1,
				external: 1,
				arrayBuffers: 1,
				count: 1,
				period: 60_000,
			} as any,
			{
				time: 100_000,
				node: 'n1',
				heapUsed: 2,
				heapTotal: 2,
				external: 2,
				arrayBuffers: 2,
				count: 1,
				period: 60_000,
			} as any,
		];
		const out = runPipeline(memorySpec, records, window, ['n1']);
		const heapUsed = out.series.find((s) => s.label === 'heap used');
		expect(heapUsed).toBeTruthy();
		expect(heapUsed!.points[0].y).toBe(2);
	});

	it('crossNode aggregator is `mean` — averages across replicas', () => {
		const records: AnalyticsDataPoint[] = [
			{
				time: 100_000,
				node: 'n1',
				heapUsed: 100,
				heapTotal: 200,
				external: 0,
				arrayBuffers: 0,
				count: 1,
				period: 60_000,
			} as any,
			{
				time: 100_000,
				node: 'n2',
				heapUsed: 200,
				heapTotal: 400,
				external: 0,
				arrayBuffers: 0,
				count: 1,
				period: 60_000,
			} as any,
		];
		const out = runPipeline(memorySpec, records, window, ['n1', 'n2']);
		const heapUsed = out.series.find((s) => s.label === 'heap used');
		expect(heapUsed!.points[0].y).toBe(150);
	});
});
