import { describe, expect, it } from 'vitest';
import { wrapperMetrics } from '../../pipeline/wrapperMetrics';
const dbMessageSpec = wrapperMetrics['db-message'].spec;
const dbReadSpec = wrapperMetrics['db-read'].spec;
const dbWriteSpec = wrapperMetrics['db-write'].spec;
import { runPipeline } from '../../pipeline/pipeline';
import type { AnalyticsDataPoint, MetricSpec, TimeRange } from '../../types/analytics';

const window: TimeRange = { startTime: 0, endTime: 1_000_000 };

// All three db specs share the same shape — single test suite asserts the
// shared invariants per spec rather than duplicating three near-identical
// files. Each spec covers a different metric name + p95 label.
function rec(path: string, p95: number, count: number, node = 'n1'): AnalyticsDataPoint {
	return { time: 100_000, node, path, p95, count, period: 60_000 } as any;
}

const SPECS: ReadonlyArray<{ name: string; spec: MetricSpec }> = [
	{ name: 'db-read', spec: dbReadSpec },
	{ name: 'db-write', spec: dbWriteSpec },
	{ name: 'db-message', spec: dbMessageSpec },
];

for (const { name, spec } of SPECS) {
	describe(`${name} spec — runPipeline`, () => {
		it('groups by path (table) producing one series per table', () => {
			const records = [
				rec('events', 30, 100),
				rec('hdb_session_will', 50, 100),
			];
			const out = runPipeline(spec, records, window, ['n1']);
			const keys = out.series.map((s) => s.key).sort();
			expect(keys).toEqual(['events', 'hdb_session_will']);
		});

		it('count-weighted-mean across nodes for the same table', () => {
			// (30·100 + 50·100) / 200 = 40.
			const records = [
				rec('events', 30, 100, 'n1'),
				rec('events', 50, 100, 'n2'),
			];
			const out = runPipeline(spec, records, window, ['n1', 'n2']);
			const events = out.series.find((s) => s.key === 'events')!;
			expect(events.points[0].y).toBe(40);
			expect(events.approx).toBe(true);
		});

		it('topN=10 + Other bucket when more than 10 tables', () => {
			const records: AnalyticsDataPoint[] = [];
			for (let i = 0; i < 12; i++) {
				records.push(rec(`tbl_${String(i).padStart(2, '0')}`, 50, (12 - i) * 200));
			}
			const out = runPipeline(spec, records, window, ['n1']);
			const keys = out.series.map((s) => s.key);
			expect(keys.includes('Other'), 'Other bucket present').toBeTruthy();
			expect(keys.length).toBe(11);
		});
	});
}
