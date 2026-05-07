import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../pipeline/pipeline.ts';
import type { AnalyticsDataPoint, MetricSpec, TimeRange } from '../../types/analytics.ts';

const spec: MetricSpec = {
	title: 'Bytes (test)',
	description: 'Hand-crafted fixture',
	tab: 'traffic',
	primaryDimension: 'node',
	subDimension: 'type',
	series: {
		kind: 'groupBy',
		dimension: 'type',
		field: {
			field: {
				kind: 'op',
				op: '*',
				left: { kind: 'ref', field: 'count' },
				right: { kind: 'ref', field: 'mean' },
			},
			label: 'bytes/sec',
			transform: { kind: 'rate' },
		},
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'sum', crossNode: 'sum' },
	primitive: 'stacked-area',
	yAxis: { unit: 'B/s', formatter: 'bytes-si' },
};

const window: TimeRange = { startTime: 1_000_000, endTime: 1_060_000 };

const records: AnalyticsDataPoint[] = [
	{ time: 1_000_000, node: 'n1', type: 'mqtt', count: 100, mean: 50, period: 60_000 },
	{ time: 1_000_000, node: 'n1', type: 'ws', count: 50, mean: 40, period: 60_000 },
	{ time: 1_000_000, node: 'n2', type: 'mqtt', count: 80, mean: 50, period: 60_000 },
];

describe('runPipeline (stacked-area by type)', () => {
	it('produces one series per unique type value', () => {
		const out = runPipeline(spec, records, window, ['n1', 'n2']);
		const keys = out.series.map((s) => s.key).sort();
		expect(keys).toEqual(['mqtt', 'ws']);
	});

	it('aggregates bytes/sec correctly across records', () => {
		const out = runPipeline(spec, records, window, ['n1', 'n2']);
		const mqtt = out.series.find((s) => s.key === 'mqtt');
		// mqtt: two records, count×mean = 5000 + 4000 = 9000 bytes over 60 s = 150 B/s.
		expect(mqtt?.points[0].y).toBe(150);
	});

	it('carries thresholds through', () => {
		const withThresh: MetricSpec = {
			...spec,
			thresholds: [{ value: 1000, label: 'max', direction: 'above-is-bad' }],
		};
		const out = runPipeline(withThresh, records, window, ['n1', 'n2']);
		expect(out.thresholds?.length).toBe(1);
	});
});

describe('runPipeline count-weighted-mean per-record counts', () => {
	const cwmSpec: MetricSpec = {
		title: 'p95 by type',
		description: '',
		tab: 'traffic',
		primaryDimension: 'node',
		subDimension: 'type',
		series: {
			kind: 'groupBy',
			dimension: 'type',
			field: { field: 'p95', label: 'p95' },
		},
		timestamp: 'time',
		bucket: { source: 'period-field', fallbackMs: 60000 },
		aggregator: { temporal: 'count-weighted-mean', crossNode: 'count-weighted-mean' },
		primitive: 'line',
		yAxis: { unit: 'ms', formatter: 'ms' },
	};

	it('weights p95 by per-record count within each time bucket', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 1, node: 'n1', type: 'mqtt', p95: 100, count: 10, period: 60000 },
			{ time: 2, node: 'n1', type: 'mqtt', p95: 200, count: 90, period: 60000 },
		];
		const out = runPipeline(cwmSpec, records, window, ['n1']);
		const mqtt = out.series.find((s) => s.key === 'mqtt');
		// Step 3 time-bucketing: each unique time is its own bucket. Within
		// each single-record bucket, CWM = value (count·value/count = value).
		expect(mqtt?.points.length).toBe(2);
		expect(mqtt?.points[0].y).toBe(100);
		expect(mqtt?.points[1].y).toBe(200);
	});
});

describe('runPipeline topN + otherBucket', () => {
	const topNSpec: MetricSpec = {
		title: 'top paths',
		description: '',
		tab: 'requests',
		primaryDimension: 'node',
		subDimension: 'path',
		series: {
			kind: 'groupBy',
			dimension: 'path',
			field: { field: 'count', label: 'requests' },
			topN: 2,
			otherBucket: true,
		},
		timestamp: 'time',
		bucket: { source: 'period-field', fallbackMs: 60000 },
		aggregator: { temporal: 'sum', crossNode: 'sum' },
		primitive: 'line',
		yAxis: { unit: 'count', formatter: 'count' },
	};

	it('keeps top 2 by total count + rolls the rest into Other', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 1, node: 'n1', path: '/a', count: 100, period: 60000 },
			{ time: 1, node: 'n1', path: '/b', count: 80, period: 60000 },
			{ time: 1, node: 'n1', path: '/c', count: 50, period: 60000 },
			{ time: 1, node: 'n1', path: '/d', count: 30, period: 60000 },
		];
		const out = runPipeline(topNSpec, records, window, ['n1']);
		const keys = out.series.map((s) => s.key);
		expect(keys.sort()).toEqual(['/a', '/b', 'Other']);
		const other = out.series.find((s) => s.key === 'Other');
		// /c + /d = 50 + 30 = 80
		expect(other?.points[0].y).toBe(80);
	});

	it('omits Other when otherBucket is false', () => {
		const strictSpec: MetricSpec = {
			...topNSpec,
			series: { ...topNSpec.series, otherBucket: false } as typeof topNSpec.series,
		};
		const records: AnalyticsDataPoint[] = [
			{ time: 1, node: 'n1', path: '/a', count: 100, period: 60000 },
			{ time: 1, node: 'n1', path: '/b', count: 80, period: 60000 },
			{ time: 1, node: 'n1', path: '/c', count: 50, period: 60000 },
		];
		const out = runPipeline(strictSpec, records, window, ['n1']);
		const keys = out.series.map((s) => s.key);
		expect(keys.sort()).toEqual(['/a', '/b']);
	});
});
