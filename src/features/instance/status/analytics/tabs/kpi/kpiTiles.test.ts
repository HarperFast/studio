import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../pipeline/pipeline';
import type { AnalyticsDataPoint, TimeRange } from '../../types/analytics';
import { collapseSeries } from './kpiMath';
import { KPI_TILES } from './kpiTiles';

const WINDOW: TimeRange = { startTime: 0, endTime: 600_000 };

describe('KPI_TILES', () => {
	it('defines the five vitals symmetrically (id, label, metric, spec, combine, formatter)', () => {
		expect(KPI_TILES).toHaveLength(5);
		expect(KPI_TILES.map((t) => t.id)).toEqual(['cpu', 'memory', 'main-thread', 'error-rate', 'p95-duration']);
		expect(new Set(KPI_TILES.map((t) => t.metric)).size).toBe(5);
		for (const t of KPI_TILES) {
			expect(t.label.length).toBeGreaterThan(0);
			expect(t.metric.length).toBeGreaterThan(0);
			expect(['sum', 'mean']).toContain(t.combine);
			expect(t.formatter.length).toBeGreaterThan(0);
			expect(t.spec.aggregator).toBeDefined();
			// Confidence suppression would blank a tile on quiet windows — the
			// tiles show whatever data exists and let the panels do the gating.
			expect(t.spec.confidence).toBeUndefined();
		}
	});

	it('error-rate tile is Σ-correct (Σcount−Σtotal)/Σcount, not mean-of-ratios', () => {
		// Canonical ratio-of-ratios fixture from pipeline/derived/error-rate.ts:
		// Σ-correct answer ≈ 0.0188; the mean-of-ratios bug would report 0.455.
		const def = KPI_TILES.find((t) => t.id === 'error-rate')!;
		const records: AnalyticsDataPoint[] = [
			{ time: 60_000, node: 'n1', period: 60_000, count: 1000, total: 990 },
			{ time: 60_000, node: 'n1', period: 60_000, count: 10, total: 1 },
		];
		const points = collapseSeries(runPipeline(def.spec, records, WINDOW, []), def.combine);
		expect(points).toHaveLength(1);
		expect(points[0].y).toBeCloseTo(19 / 1010, 10);
	});

	it('cpu tile sums the harper + user scopes into total process CPU', () => {
		const def = KPI_TILES.find((t) => t.id === 'cpu')!;
		const records: AnalyticsDataPoint[] = [
			{ time: 60_000, node: 'n1', period: 60_000, path: 'harper', count: 50, p95: 0.3 },
			{ time: 60_000, node: 'n1', period: 60_000, path: 'user', count: 50, p95: 0.2 },
		];
		const points = collapseSeries(runPipeline(def.spec, records, WINDOW, []), def.combine, def.includeDims);
		expect(points).toHaveLength(1);
		expect(points[0].y).toBeCloseTo(0.5, 10);
	});

	it('cpu tile excludes hot-function-location records from the scope sum', () => {
		const def = KPI_TILES.find((t) => t.id === 'cpu')!;
		const records: AnalyticsDataPoint[] = [
			{ time: 60_000, node: 'n1', period: 60_000, path: 'harper', count: 50, p95: 0.3 },
			{ time: 60_000, node: 'n1', period: 60_000, path: 'user', count: 50, p95: 0.2 },
			// Profiler hot-location record (>100 hits at one code location):
			// its samples are already counted in the harper/user totals, so
			// summing its series would double-count CPU on busy nodes.
			{ time: 60_000, node: 'n1', period: 60_000, path: '/app/resources.js:42', count: 120, p95: 0.25 },
		];
		const points = collapseSeries(runPipeline(def.spec, records, WINDOW, []), def.combine, def.includeDims);
		expect(points).toHaveLength(1);
		expect(points[0].y).toBeCloseTo(0.5, 10);
	});

	it('cpu tile gaps a bucket missing one scope instead of reporting a partial sum as the total', () => {
		const def = KPI_TILES.find((t) => t.id === 'cpu')!;
		const records: AnalyticsDataPoint[] = [
			{ time: 60_000, node: 'n1', period: 60_000, path: 'harper', count: 50, p95: 0.3 },
			{ time: 60_000, node: 'n1', period: 60_000, path: 'user', count: 50, p95: 0.2 },
			// Second bucket only has the harper scope — harper-alone is not
			// total process CPU, so the bucket must gap, not read as 0.4.
			{ time: 120_000, node: 'n1', period: 60_000, path: 'harper', count: 50, p95: 0.4 },
		];
		const points = collapseSeries(runPipeline(def.spec, records, WINDOW, []), def.combine, def.includeDims);
		expect(points).toHaveLength(1);
		expect(points[0].x).toBe(60_000);
		expect(points[0].y).toBeCloseTo(0.5, 10);
	});

	it('memory tile reads the last heapUsed per node and means across nodes', () => {
		const def = KPI_TILES.find((t) => t.id === 'memory')!;
		const records: AnalyticsDataPoint[] = [
			{ time: 60_000, node: 'n1', period: 60_000, heapUsed: 100 },
			{ time: 60_000, node: 'n2', period: 60_000, heapUsed: 300 },
		];
		const points = collapseSeries(runPipeline(def.spec, records, WINDOW, []), def.combine);
		expect(points).toEqual([{ x: 60_000, y: 200 }]);
	});

	it('main-thread tile projects active / (active + idle)', () => {
		const def = KPI_TILES.find((t) => t.id === 'main-thread')!;
		const records: AnalyticsDataPoint[] = [
			{ time: 60_000, node: 'n1', period: 60_000, active: 25, idle: 75 },
		];
		const points = collapseSeries(runPipeline(def.spec, records, WINDOW, []), def.combine);
		expect(points).toEqual([{ x: 60_000, y: 0.25 }]);
	});

	it('p95-duration tile count-weights p95 across paths', () => {
		const def = KPI_TILES.find((t) => t.id === 'p95-duration')!;
		const records: AnalyticsDataPoint[] = [
			{ time: 60_000, node: 'n1', period: 60_000, path: '/a', count: 900, p95: 10 },
			{ time: 60_000, node: 'n1', period: 60_000, path: '/b', count: 100, p95: 110 },
		];
		const points = collapseSeries(runPipeline(def.spec, records, WINDOW, []), def.combine);
		expect(points).toHaveLength(1);
		expect(points[0].y).toBeCloseTo(20, 10); // (900·10 + 100·110) / 1000
	});
});
