import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../pipeline/pipeline.ts';
import type { AnalyticsDataPoint, MetricSpec } from '../../types/analytics.ts';

const baseSpec: MetricSpec = {
	title: 'test',
	description: 'test',
	tab: 'traffic',
	primaryDimension: 'node',
	subDimension: 'type',
	series: { kind: 'groupBy', dimension: 'type', field: { field: 'count', label: 'count' } },
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'sum', crossNode: 'sum' },
	primitive: 'stacked-area',
	yAxis: { unit: '/s', formatter: 'count' },
};

describe('runGroupBy time-bucketing', () => {
	it('emits one point per unique time per dimension value', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 100, node: 'n1', type: 'mqtt', count: 10, period: 60000 },
			{ time: 200, node: 'n1', type: 'mqtt', count: 20, period: 60000 },
			{ time: 100, node: 'n1', type: 'ws', count: 5, period: 60000 },
		];
		const out = runPipeline(baseSpec, records, { startTime: 0, endTime: 1000 }, []);
		const mqtt = out.series.find((s) => s.key === 'mqtt');
		const ws = out.series.find((s) => s.key === 'ws');
		expect(mqtt?.points.length).toBe(2);
		expect(ws?.points.length).toBe(1);
	});

	it('sorts bucket points monotonically by time', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 300, node: 'n1', type: 'mqtt', count: 30, period: 60000 },
			{ time: 100, node: 'n1', type: 'mqtt', count: 10, period: 60000 },
			{ time: 200, node: 'n1', type: 'mqtt', count: 20, period: 60000 },
		];
		const out = runPipeline(baseSpec, records, { startTime: 0, endTime: 1000 }, []);
		const mqtt = out.series.find((s) => s.key === 'mqtt');
		expect(mqtt?.points.map((p) => p.x)).toEqual([100, 200, 300]);
	});

	it('handles sparse buckets across dimensions (no implicit zero-fill)', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 100, node: 'n1', type: 'a', count: 1, period: 60000 },
			{ time: 300, node: 'n1', type: 'a', count: 3, period: 60000 },
			{ time: 200, node: 'n1', type: 'b', count: 2, period: 60000 },
			{ time: 300, node: 'n1', type: 'b', count: 4, period: 60000 },
		];
		const out = runPipeline(baseSpec, records, { startTime: 0, endTime: 1000 }, []);
		const a = out.series.find((s) => s.key === 'a');
		const b = out.series.find((s) => s.key === 'b');
		expect(a?.points.map((p) => p.x)).toEqual([100, 300]);
		expect(b?.points.map((p) => p.x)).toEqual([200, 300]);
	});

	it('drops records with non-numeric time (no phantom 0-bucket) — groupBy', () => {
		// Reserved: 0 was the legacy phantom-bucket fallback value (Step 3 pipeline).
		// Step 3.5 drops malformed records instead of inventing time=0 buckets.
		const records: AnalyticsDataPoint[] = [
			{ time: 100, node: 'n1', type: 'mqtt', count: 10, period: 60000 } as any,
			{ time: 'oops' as any, node: 'n1', type: 'mqtt', count: 999, period: 60000 } as any,
			{ time: 200, node: 'n1', type: 'mqtt', count: 20, period: 60000 } as any,
		];
		const out = runPipeline(baseSpec, records, { startTime: 0, endTime: 1000 }, []);
		const mqtt = out.series.find((s) => s.key === 'mqtt');
		expect(mqtt?.points.length).toBe(2);
		expect(mqtt?.points.map((p) => p.x)).toEqual([100, 200]);
		expect(mqtt?.points.some((p) => p.x === 0)).toBe(false);
	});
});

const fieldSpec: MetricSpec = {
	title: 'fs',
	description: '',
	tab: 'health',
	primaryDimension: 'node',
	series: { kind: 'field', fields: [{ field: 'a', label: 'A' }, { field: 'b', label: 'B' }] },
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'sum', crossNode: 'sum' },
	primitive: 'small-multiples',
	yAxis: { unit: '', formatter: 'count' },
};

describe('runFieldSpecs time-bucketing', () => {
	it('emits one SeriesPoint per unique time per field', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 100, node: 'n1', a: 5, b: 50, period: 60000 } as any,
			{ time: 200, node: 'n1', a: 10, b: 100, period: 60000 } as any,
			{ time: 300, node: 'n1', a: 15, b: 150, period: 60000 } as any,
		];
		const out = runPipeline(fieldSpec, records, { startTime: 0, endTime: 1000 }, []);
		expect(out.series.length).toBe(2);
		const a = out.series.find((s) => s.label === 'A');
		const b = out.series.find((s) => s.label === 'B');
		expect(a?.points.length).toBe(3);
		expect(b?.points.length).toBe(3);
		expect(a?.points.map((p) => p.x)).toEqual([100, 200, 300]);
		expect(a?.points.map((p) => p.y)).toEqual([5, 10, 15]);
	});

	it('drops records with non-numeric time (no phantom 0-bucket) — field path', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 100, node: 'n1', a: 5, period: 60000 } as any,
			{ time: 'bad' as any, node: 'n1', a: 999, period: 60000 } as any,
		];
		const out = runPipeline(fieldSpec, records, { startTime: 0, endTime: 1000 }, []);
		const a = out.series.find((s) => s.label === 'A');
		expect(a?.points.length).toBe(1);
		expect(a?.points[0].x).toBe(100);
	});
});

describe('runGroupBy cross-node aggregation', () => {
	const baseGroupBySpec: MetricSpec = {
		title: 't',
		description: '',
		tab: 'health',
		primaryDimension: 'node',
		series: { kind: 'groupBy', dimension: 'type', field: { field: 'count', label: 'count' } },
		timestamp: 'time',
		bucket: { source: 'period-field', fallbackMs: 60000 },
		aggregator: { temporal: 'sum', crossNode: 'max' },
		primitive: 'stacked-area',
		yAxis: { unit: '', formatter: 'count' },
	};

	it('two-pass: temporal=sum within node, crossNode=max across nodes', () => {
		const records = [
			{ time: 100, node: 'n1', type: 'a', count: 10, period: 60000 } as any,
			{ time: 100, node: 'n1', type: 'a', count: 20, period: 60000 } as any,
			{ time: 100, node: 'n2', type: 'a', count: 7, period: 60000 } as any,
		];
		const out = runPipeline(baseGroupBySpec, records, { startTime: 0, endTime: 1000 }, []);
		const a = out.series.find((s) => s.key === 'a');
		// n1 inner sum: 10+20 = 30; n2 inner sum: 7. crossNode max: 30.
		expect(a?.points.length).toBe(1);
		expect(a?.points[0].y).toBe(30);
	});

	it('two-pass: sum/sum is associative (matches flat sum)', () => {
		const sumSumSpec: MetricSpec = { ...baseGroupBySpec, aggregator: { temporal: 'sum', crossNode: 'sum' } };
		const records = [
			{ time: 100, node: 'n1', type: 'a', count: 10, period: 60000 } as any,
			{ time: 100, node: 'n1', type: 'a', count: 20, period: 60000 } as any,
			{ time: 100, node: 'n2', type: 'a', count: 7, period: 60000 } as any,
		];
		const out = runPipeline(sumSumSpec, records, { startTime: 0, endTime: 1000 }, []);
		const a = out.series.find((s) => s.key === 'a');
		expect(a?.points[0].y).toBe(37);
	});

	// Note: count-weighted-mean across nodes is documented as a known
	// limitation in pipeline.ts — the inner pass attaches each node-bucket's
	// totalCount as the weight for the outer pass, which over-counts when a
	// node-bucket holds multiple records. No CWM-crossNode spec ships today,
	// so we don't add a failing test here.
});

describe('runFieldSpecs cross-node aggregation', () => {
	const baseFieldSpec: MetricSpec = {
		title: 't',
		description: '',
		tab: 'health',
		primaryDimension: 'node',
		series: { kind: 'field', fields: [{ field: 'a', label: 'A', aggregator: { temporal: 'sum', crossNode: 'max' } }] },
		timestamp: 'time',
		bucket: { source: 'period-field', fallbackMs: 60000 },
		aggregator: { temporal: 'sum', crossNode: 'sum' },
		primitive: 'small-multiples',
		yAxis: { unit: '', formatter: 'count' },
	};

	it('two-pass: temporal=sum within node, crossNode=max across nodes (field path)', () => {
		const records = [
			{ time: 100, node: 'n1', a: 5, period: 60000 } as any,
			{ time: 100, node: 'n1', a: 10, period: 60000 } as any,
			{ time: 100, node: 'n2', a: 7, period: 60000 } as any,
		];
		const out = runPipeline(baseFieldSpec, records, { startTime: 0, endTime: 1000 }, []);
		const a = out.series.find((s) => s.label === 'A');
		// n1 inner sum: 15; n2 inner sum: 7. crossNode max: 15.
		expect(a?.points.length).toBe(1);
		expect(a?.points[0].y).toBe(15);
	});
});
