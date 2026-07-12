// Regression tests for issue #1444: records missing `period` (or carrying an
// invalid one — 0, negative, NaN) must not be silently dropped by rate
// transforms. The pipeline resolves the effective period via the same
// `spec.bucket.fallbackMs ?? 60_000` convention snapToBucketTime uses.
import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../pipeline/pipeline.ts';
import type { AnalyticsDataPoint, MetricSpec, TimeRange } from '../../types/analytics.ts';

const window: TimeRange = { startTime: 1_000_000, endTime: 1_060_000 };

const groupBySpec: MetricSpec = {
	title: 'Bytes (rate fallback test)',
	description: 'groupBy spec with a rate transform',
	tab: 'traffic',
	primaryDimension: 'node',
	subDimension: 'type',
	series: {
		kind: 'groupBy',
		dimension: 'type',
		field: { field: 'bytes', label: 'bytes/sec', transform: { kind: 'rate' } },
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'sum', crossNode: 'sum' },
	primitive: 'stacked-area',
	yAxis: { unit: 'B/s', formatter: 'bytes-si' },
};

describe('rate transform period fallback (groupBy)', () => {
	it('computes the rate with bucket.fallbackMs when period is missing', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 1_000_000, node: 'n1', type: 'mqtt', bytes: 120_000 },
		];
		const out = runPipeline(groupBySpec, records, window, ['n1']);
		const mqtt = out.series.find((s) => s.key === 'mqtt');
		// 120000 bytes over the 60 s fallback = 2000 B/s — not dropped.
		expect(mqtt?.points).toEqual([{ x: 1_000_000, y: 2000, count: 1 }]);
	});

	it('treats a non-positive fallbackMs as misconfigured and uses the 60s default', () => {
		const spec: MetricSpec = { ...groupBySpec, bucket: { source: 'period-field', fallbackMs: 0 } };
		const records: AnalyticsDataPoint[] = [
			{ time: 1_000_000, node: 'n1', type: 'mqtt', bytes: 120_000 },
		];
		const out = runPipeline(spec, records, window, ['n1']);
		const mqtt = out.series.find((s) => s.key === 'mqtt');
		// fallbackMs: 0 must not reintroduce the divide-by-zero drop — 60 s default applies.
		expect(mqtt?.points).toEqual([{ x: 1_000_000, y: 2000, count: 1 }]);
	});

	it('treats period: 0 the same as a missing period', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 1_000_000, node: 'n1', type: 'mqtt', bytes: 120_000, period: 0 },
		];
		const out = runPipeline(groupBySpec, records, window, ['n1']);
		const mqtt = out.series.find((s) => s.key === 'mqtt');
		expect(mqtt?.points).toEqual([{ x: 1_000_000, y: 2000, count: 1 }]);
	});

	it('treats negative and NaN periods the same as a missing period', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 1_000_000, node: 'n1', type: 'mqtt', bytes: 60_000, period: -30_000 },
			{ time: 1_000_000, node: 'n1', type: 'mqtt', bytes: 60_000, period: NaN },
		];
		const out = runPipeline(groupBySpec, records, window, ['n1']);
		const mqtt = out.series.find((s) => s.key === 'mqtt');
		// Each record: 60000 bytes / 60 s fallback = 1000 B/s; temporal sum = 2000.
		expect(mqtt?.points).toEqual([{ x: 1_000_000, y: 2000, count: 2 }]);
	});

	it('uses the record period unchanged when it is a positive finite number', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 1_000_000, node: 'n1', type: 'mqtt', bytes: 120_000, period: 30_000 },
		];
		const out = runPipeline(groupBySpec, records, window, ['n1']);
		const mqtt = out.series.find((s) => s.key === 'mqtt');
		// 120000 bytes over the record's own 30 s = 4000 B/s.
		expect(mqtt?.points).toEqual([{ x: 1_000_000, y: 4000, count: 1 }]);
	});

	it('honors a non-default spec fallbackMs', () => {
		const spec: MetricSpec = { ...groupBySpec, bucket: { source: 'period-field', fallbackMs: 30_000 } };
		const records: AnalyticsDataPoint[] = [
			{ time: 1_000_000, node: 'n1', type: 'mqtt', bytes: 120_000 },
		];
		const out = runPipeline(spec, records, window, ['n1']);
		const mqtt = out.series.find((s) => s.key === 'mqtt');
		// 120000 bytes over the spec's 30 s fallback = 4000 B/s.
		expect(mqtt?.points).toEqual([{ x: 1_000_000, y: 4000, count: 1 }]);
	});

	it('defaults to 60_000 when the spec has no fallbackMs', () => {
		const spec: MetricSpec = { ...groupBySpec, bucket: { source: 'period-field' } };
		const records: AnalyticsDataPoint[] = [
			{ time: 1_000_000, node: 'n1', type: 'mqtt', bytes: 120_000 },
		];
		const out = runPipeline(spec, records, window, ['n1']);
		const mqtt = out.series.find((s) => s.key === 'mqtt');
		expect(mqtt?.points).toEqual([{ x: 1_000_000, y: 2000, count: 1 }]);
	});
});

describe('rate transform period fallback (field)', () => {
	const fieldSpec: MetricSpec = {
		title: 'Transfer (rate fallback test)',
		description: 'field spec with a rate transform',
		tab: 'traffic',
		primaryDimension: 'node',
		series: {
			kind: 'field',
			fields: [{ field: 'bytes', label: 'bytes/sec', transform: { kind: 'rate' } }],
		},
		timestamp: 'time',
		bucket: { source: 'period-field', fallbackMs: 60000 },
		aggregator: { temporal: 'sum', crossNode: 'sum' },
		primitive: 'line',
		yAxis: { unit: 'B/s', formatter: 'bytes-si' },
	};

	it('computes the rate with bucket.fallbackMs when period is missing', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 1_000_000, node: 'n1', bytes: 120_000 },
		];
		const out = runPipeline(fieldSpec, records, window, ['n1']);
		expect(out.series[0].points).toEqual([{ x: 1_000_000, y: 2000, count: 1 }]);
	});

	it('mixes fallback and explicit periods within one bucket', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 1_000_000, node: 'n1', bytes: 120_000 }, // 60 s fallback → 2000 B/s
			{ time: 1_000_000, node: 'n1', bytes: 120_000, period: 30_000 }, // → 4000 B/s
		];
		const out = runPipeline(fieldSpec, records, window, ['n1']);
		expect(out.series[0].points).toEqual([{ x: 1_000_000, y: 6000, count: 2 }]);
	});
});
