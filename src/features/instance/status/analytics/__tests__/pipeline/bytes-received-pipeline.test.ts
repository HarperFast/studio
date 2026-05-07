import { describe, expect, it } from 'vitest';
import { bytesReceivedSpec } from '../../pipeline/bytes-received.tsx';
import { runPipeline } from '../../pipeline/pipeline.ts';
import type { AnalyticsDataPoint, TimeRange } from '../../types/analytics.ts';

const window: TimeRange = { startTime: 0, endTime: 1_000_000 };

// Mirrors bytes-sent-tolerance.test.ts but uses synthetic records to exercise
// the spec's groupBy+stacked-area shape. Tolerance against fixture data is
// already covered for bytes-sent; bytes-received's spec is structurally
// identical so we focus on shape + math here.
describe('bytes-received spec — runPipeline', () => {
	it('groups by type and produces one series per type', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', type: 'mqtt', count: 100, mean: 50, period: 60_000 } as any,
			{ time: 100_000, node: 'n1', type: 'egress', count: 200, mean: 30, period: 60_000 } as any,
		];
		const out = runPipeline(bytesReceivedSpec, records, window, ['n1']);
		const keys = out.series.map((s) => s.key).sort();
		expect(keys).toEqual(['egress', 'mqtt']);
	});

	it('rate = (count × mean) / period × 1000 — bytes/sec', () => {
		// count=60, mean=50 → 3000 bytes; over 60 s = 50 B/s.
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', type: 'mqtt', count: 60, mean: 50, period: 60_000 } as any,
		];
		const out = runPipeline(bytesReceivedSpec, records, window, ['n1']);
		const mqtt = out.series.find((s) => s.key === 'mqtt')!;
		expect(mqtt.points[0].y).toBe(50);
	});

	it('cluster total — sum across nodes for the same type+time', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', type: 'mqtt', count: 60, mean: 50, period: 60_000 } as any,
			{ time: 100_000, node: 'n2', type: 'mqtt', count: 60, mean: 50, period: 60_000 } as any,
		];
		const out = runPipeline(bytesReceivedSpec, records, window, ['n1', 'n2']);
		const mqtt = out.series.find((s) => s.key === 'mqtt')!;
		expect(mqtt.points[0].y, 'sum/sum across two nodes = 100 B/s').toBe(100);
	});

	it('drops records with period <= 0 (rate transform null guard)', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', type: 'mqtt', count: 60, mean: 50, period: 0 } as any,
		];
		const out = runPipeline(bytesReceivedSpec, records, window, ['n1']);
		const mqtt = out.series.find((s) => s.key === 'mqtt')!;
		expect(mqtt, 'no series when only record has period=0').toBe(undefined);
	});
});
