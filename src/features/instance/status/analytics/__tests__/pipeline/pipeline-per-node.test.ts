import { describe, expect, it } from 'vitest';
import { makeSeriesKey, runPipeline } from '../../pipeline/pipeline.ts';
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

	it('carries dim/node as structured fields on every per-node series', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', path: '/a', p95: 10, count: 100, period: 60_000 } as any,
			{ time: 100_000, node: 'n2', path: '/a', p95: 20, count: 100, period: 60_000 } as any,
		];
		const out = runPipeline(baseSpec, records, window, ['n1', 'n2'], { perNode: true });
		const pairs = out.series.map((s) => ({ dim: s.dim, node: s.node })).sort((a, b) =>
			(a.node ?? '').localeCompare(b.node ?? '')
		);
		expect(pairs).toEqual([{ dim: '/a', node: 'n1' }, { dim: '/a', node: 'n2' }]);
	});

	it('a dimension value containing "|" survives per-node mode uncorrupted', () => {
		// Regression for #1450: URL paths can contain '|'; splitting the old
		// `${dim}|${node}` key at the first '|' truncated the dim and mangled
		// the node. The structured fields must round-trip the value exactly.
		const path = '/api|v2/x';
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', path, p95: 10, count: 100, period: 60_000 } as any,
			{ time: 100_000, node: 'n2', path, p95: 20, count: 100, period: 60_000 } as any,
		];
		const out = runPipeline(baseSpec, records, window, ['n1', 'n2'], { perNode: true });
		expect(out.series.length).toBe(2);
		for (const s of out.series) {
			expect(s.dim).toBe(path);
			expect(['n1', 'n2']).toContain(s.node);
			expect(s.key).toBe(makeSeriesKey(path, s.node!));
		}
	});

	it('cluster-aggregate series carry dim (and node only for groupBy-node specs)', () => {
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', path: '/a', p95: 10, count: 100, period: 60_000 } as any,
			{ time: 100_000, node: 'n2', path: '/a', p95: 20, count: 100, period: 60_000 } as any,
		];
		const out = runPipeline(baseSpec, records, window, ['n1', 'n2']);
		expect(out.series[0].dim).toBe('/a');
		expect(out.series[0].node).toBeUndefined();

		const nodeSpec: MetricSpec = {
			...baseSpec,
			series: { kind: 'groupBy', dimension: 'node', field: { field: 'p95', label: 'p95' } },
		};
		const perNodeOut = runPipeline(nodeSpec, records, window, ['n1', 'n2'], { perNode: true });
		const nodes = perNodeOut.series.map((s) => s.node).sort();
		expect(nodes).toEqual(['n1', 'n2']);
		expect(perNodeOut.series.every((s) => s.key === s.node && s.dim === s.node)).toBe(true);
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

	it('field-mode per-node series carry the field key as dim plus the node', () => {
		const fieldSpec: MetricSpec = {
			...baseSpec,
			series: { kind: 'field', fields: [{ field: 'p95', label: 'p95' }] },
		};
		const records: AnalyticsDataPoint[] = [
			{ time: 100_000, node: 'n1', path: '/a', p95: 10, count: 100, period: 60_000 } as any,
			{ time: 100_000, node: 'n2', path: '/a', p95: 20, count: 100, period: 60_000 } as any,
		];
		const out = runPipeline(fieldSpec, records, window, ['n1', 'n2'], { perNode: true });
		const pairs = out.series.map((s) => ({ key: s.key, dim: s.dim, node: s.node })).sort((a, b) =>
			(a.node ?? '').localeCompare(b.node ?? '')
		);
		expect(pairs).toEqual([
			{ key: makeSeriesKey('p95', 'n1'), dim: 'p95', node: 'n1' },
			{ key: makeSeriesKey('p95', 'n2'), dim: 'p95', node: 'n2' },
		]);
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
