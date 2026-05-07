import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../pipeline/pipeline.ts';
import type { AnalyticsDataPoint, MetricSpec, TimeRange } from '../../types/analytics.ts';

const window: TimeRange = { startTime: 0, endTime: 1_000_000 };

const baseSpec: MetricSpec = {
	title: 'Per-node test',
	description: '',
	tab: 'requests',
	primaryDimension: 'path',
	series: {
		kind: 'groupBy',
		dimension: 'path',
		field: { field: 'p95', label: 'p95' },
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60_000 },
	aggregator: { temporal: 'count-weighted-mean', crossNode: 'count-weighted-mean' },
	primitive: 'line',
	yAxis: { unit: ' ms', formatter: 'ms' },
};

describe('runPipeline { perNode: true }', () => {
	it('emits one series per (dim, node) — keys are `${dim}|${node}`', () => {
		// Two paths × two nodes = 4 series in perNode mode.
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', path: '/a', p95: 10, count: 100, period: 60_000 } as any,
			{ time: 100_000, node: 'n2', path: '/a', p95: 20, count: 100, period: 60_000 } as any,
			{ time: 100_000, node: 'n1', path: '/b', p95: 30, count: 100, period: 60_000 } as any,
			{ time: 100_000, node: 'n2', path: '/b', p95: 40, count: 100, period: 60_000 } as any,
		];
		const out = runPipeline(baseSpec, records, window, ['n1', 'n2'], { perNode: true });
		const keys = out.series.map((s) => s.key).sort();
		expect(keys).toEqual(['/a|n1', '/a|n2', '/b|n1', '/b|n2']);
	});

	it('skips crossNode pass — each node series carries its own raw value', () => {
		// Without perNode: cluster CWM = (10·100 + 20·100)/200 = 15.
		// With perNode: n1 series = 10, n2 series = 20.
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', path: '/a', p95: 10, count: 100, period: 60_000 } as any,
			{ time: 100_000, node: 'n2', path: '/a', p95: 20, count: 100, period: 60_000 } as any,
		];
		const out = runPipeline(baseSpec, records, window, ['n1', 'n2'], { perNode: true });
		const n1 = out.series.find((s) => s.key === '/a|n1');
		const n2 = out.series.find((s) => s.key === '/a|n2');
		expect(n1?.points[0].y).toBe(10);
		expect(n2?.points[0].y).toBe(20);
	});

	it('default (perNode omitted) still produces cluster-aggregate series', () => {
		// Regression guard — adding perNode must not change default behavior.
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', path: '/a', p95: 10, count: 100, period: 60_000 } as any,
			{ time: 100_000, node: 'n2', path: '/a', p95: 20, count: 100, period: 60_000 } as any,
		];
		const out = runPipeline(baseSpec, records, window, ['n1', 'n2']);
		expect(out.series.length).toBe(1);
		expect(out.series[0].key).toBe('/a');
		// Cluster CWM across nodes.
		expect(out.series[0].points[0].y).toBe(15);
	});

	it('node-series labels include (approx) when aggregator is count-weighted-mean', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', path: '/a', p95: 10, count: 100, period: 60_000 } as any,
		];
		const out = runPipeline(baseSpec, records, window, ['n1'], { perNode: true });
		const s = out.series.find((k) => k.key === '/a|n1');
		expect(s).toBeTruthy();
		expect(s!.label).toMatch(/\(approx\)$/);
	});
});
