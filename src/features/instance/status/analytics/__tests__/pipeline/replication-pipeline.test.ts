import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aggregateReplicationMatrix, bucketLineSeries } from '../../pipeline/replication-latency';
import type { AnalyticsDataPoint } from '../../types/analytics';

const multi = JSON.parse(
	readFileSync(join(import.meta.dirname, '../fixtures/replication-latency/multi-source.json'), 'utf8'),
) as AnalyticsDataPoint[];
const lowCountMatrix = JSON.parse(
	readFileSync(join(import.meta.dirname, '../fixtures/replication-latency/low-count-matrix.json'), 'utf8'),
) as AnalyticsDataPoint[];

const NODES = [
	'xb6-us-west-1.prod.ibm.harperfabric.com',
	'4u4-us-east-1.prod.ibm.harperfabric.com',
	'846-fr-par-1.prod.ibm.harperfabric.com',
	'dest-a.prod.ibm.harperfabric.com',
	'dest-b.prod.ibm.harperfabric.com',
];

describe('aggregateReplicationMatrix', () => {
	it('rows = unique sources, cols = unique destinations, 1 cell per pair', () => {
		const out = aggregateReplicationMatrix(multi, NODES);
		expect(out.rows.length).toBe(3);
		expect(out.cols.length).toBe(2);
		expect(out.cells.length).toBe(6);
	});

	it('cell value is count-weighted-mean of p95 with count accumulated (computed expected)', () => {
		const out = aggregateReplicationMatrix(multi, NODES);
		const cell = out.cells.find((c) => c.row.startsWith('xb6') && c.col === 'dest-a.prod.ibm.harperfabric.com')!;
		expect(cell).toBeTruthy();
		expect(cell.value !== null).toBeTruthy();
		expect(cell.count && cell.count > 0).toBeTruthy();

		// Compute the expected count-weighted-mean directly from the fixture
		const matching = multi.filter((r) =>
			r.node === 'dest-a.prod.ibm.harperfabric.com'
			&& typeof r.path === 'string'
			&& r.path.startsWith('xb6')
		);
		const numer = matching.reduce((s, r) => s + (r.p95 as number) * (r.count as number), 0);
		const denom = matching.reduce((s, r) => s + (r.count as number), 0);
		const expected = numer / denom;
		expect(Math.abs((cell.value ?? 0) - expected) < 1e-6).toBeTruthy();
	});

	it('counts skipped records for unparseable paths', () => {
		const withGarbage = [
			...multi,
			{
				time: 0,
				node: 'dest-a.prod.ibm.harperfabric.com',
				path: 'garbage',
				count: 5,
				p95: 1,
				period: 60000,
			} as AnalyticsDataPoint,
		];
		const out = aggregateReplicationMatrix(withGarbage, NODES);
		expect(out.cells.length).toBe(6);
		expect(out.skippedRecordsCount).toBe(1);
	});

	it('tracks unparseable-path and missing-percentile omissions separately', () => {
		const withBothCauses = [
			...multi,
			// Cause 1: path does not parse into source/db/table.
			{
				time: 0,
				node: 'dest-a.prod.ibm.harperfabric.com',
				path: 'garbage',
				count: 5,
				p95: 1,
				period: 60000,
			} as AnalyticsDataPoint,
			// Cause 2: parseable path but no value for the selected percentile.
			{
				time: 0,
				node: 'dest-a.prod.ibm.harperfabric.com',
				path: 'xb6-us-west-1.prod.ibm.harperfabric.com.db.events',
				count: 5,
				period: 60000,
			} as AnalyticsDataPoint,
		];
		const out = aggregateReplicationMatrix(withBothCauses, NODES);
		expect(out.unparseablePathCount).toBe(1);
		expect(out.missingValueCount).toBe(1);
		expect(out.skippedRecordsCount).toBe(2);
	});

	it('recovers known-shape-but-unknown-node paths via heuristic + lists them as unrecognized', () => {
		// pathParser falls back to "last 2 segments are db.table" when no
		// known-node prefix matches. This recovers records from sources not
		// in the cluster snapshot (asymmetric replication, gateways, etc.)
		// while still surfacing them in unrecognizedSources for the operator.
		const withOrphanShape = [
			...multi,
			{
				time: 0,
				node: 'dest-a.prod.ibm.harperfabric.com',
				path: 'unknown-host.example.com.data.events',
				count: 5,
				p95: 1,
				period: 60000,
			} as AnalyticsDataPoint,
		];
		const out = aggregateReplicationMatrix(withOrphanShape, NODES);
		// 0 records skipped (recovered via heuristic), but 'unknown-host.example.com'
		// is reported in unrecognizedSources.
		expect(out.skippedRecordsCount).toBe(0);
		expect(out.unrecognizedSources).toEqual(['unknown-host.example.com']);
	});

	it('returns empty when no records parse', () => {
		const out = aggregateReplicationMatrix([], NODES);
		expect(out.cells.length).toBe(0);
		expect(out.rows.length).toBe(0);
		expect(out.cols.length).toBe(0);
		expect(out.skippedRecordsCount).toBe(0);
	});

	it('low-count-matrix fixture produces guaranteed tier coverage', () => {
		const out = aggregateReplicationMatrix(lowCountMatrix, NODES);
		const tiers = out.cells.map((c) => c.count ?? 0).sort((a, b) => a - b);
		expect(tiers[0], 'suppress-tier cell present').toBe(20);
		expect(tiers[1], 'grey-tier cell present').toBe(60);
		expect(tiers[2] >= 100, 'ok-tier cell present').toBeTruthy();
		expect(tiers[3] >= 100, 'second ok-tier cell present').toBeTruthy();
	});
});

describe('bucketLineSeries', () => {
	it('returns time-ascending points + approx=true for the multi-source fixture (>1 record/bucket)', () => {
		const out = bucketLineSeries(
			multi,
			'xb6-us-west-1.prod.ibm.harperfabric.com',
			'dest-a.prod.ibm.harperfabric.com',
			NODES,
		);
		expect(out.points.length > 0).toBeTruthy();
		for (let i = 1; i < out.points.length; i++) {
			expect(out.points[i].x >= out.points[i - 1].x, 'monotonic time order').toBeTruthy();
		}
		// Multi-source fixture has 2 records per (source, dest, time) — events + users tables.
		expect(out.approx).toBe(true);
	});

	it('computes count-weighted-mean and sets approx=true when a bucket has >1 records', () => {
		// Synthetic: two records share (source, dest, time=1000). Σ = (10*100 + 90*50) / 100 = 55.
		const records = [
			{ time: 1000, node: 'd1', path: 's1.db.t1', count: 10, p95: 100, period: 60000 },
			{ time: 1000, node: 'd1', path: 's1.db.t1', count: 90, p95: 50, period: 60000 },
			{ time: 2000, node: 'd1', path: 's1.db.t1', count: 50, p95: 200, period: 60000 },
		];
		const out = bucketLineSeries(records as unknown as AnalyticsDataPoint[], 's1', 'd1', ['s1']);
		expect(out.points.length).toBe(2);
		expect(out.points[0].x).toBe(1000);
		expect(Math.abs((out.points[0].y as number) - 55) < 1e-9, `expected 55, got ${out.points[0].y}`).toBeTruthy();
		expect(out.points[1].x).toBe(2000);
		expect(out.points[1].y).toBe(200);
		expect(out.approx).toBe(true);
	});

	it('skips records without a numeric time (no x=0/1970 bucket)', () => {
		const records = [
			{ node: 'd1', path: 's1.db.t1', count: 5, p95: 10, period: 60000 },
			{ time: 1000, node: 'd1', path: 's1.db.t1', count: 5, p95: 20, period: 60000 },
		];
		const out = bucketLineSeries(records as unknown as AnalyticsDataPoint[], 's1', 'd1', ['s1']);
		expect(out.points.length).toBe(1);
		expect(out.points[0].x).toBe(1000);
	});
});
