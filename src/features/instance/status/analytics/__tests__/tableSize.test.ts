import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	type Snapshot,
	buildDerived,
	computeBucketMs,
	computeDefaultSelection,
	computeGrowthAnnotation,
	computeSnapshot,
	computeTableSet,
	computeTrendFactory,
	dedupRecords,
	emptyCauseToFlags,
	normalizeRecords,
	resolveSelection,
	TOP_N,
	toTableKey,
} from '../lib/tableSize.ts';
import type { TableSizeRecord } from '../types/analytics.ts';

function fixture(name: string): TableSizeRecord[] {
	const path = join(import.meta.dirname, 'fixtures', 'table-size', `${name}.json`);
	return JSON.parse(readFileSync(path, 'utf8'));
}

describe('normalizeRecords', () => {
	it('maps id → time and builds tableKey', () => {
		const normalized = normalizeRecords(fixture('single-sample'));
		expect(normalized.every((r) => typeof r.time === 'number')).toBeTruthy();
		expect(normalized.every((r) => !('id' in r))).toBeTruthy();
		const big = normalized.find((r) => r.tableKey === 'd.big')!;
		expect(big).toBeTruthy();
		expect(big.time).toBe(1700000000000);
	});

	it('sorts by time ascending (stable by input order within a tie)', () => {
		const normalized = normalizeRecords(fixture('growth-window'));
		for (let i = 1; i < normalized.length; i++) {
			expect(normalized[i].time >= normalized[i - 1].time).toBeTruthy();
		}
	});

	it('handles empty input', () => {
		expect(normalizeRecords([])).toEqual([]);
	});

	it('coerces non-string node values to strings', () => {
		// Some Harper builds serialize a numeric node name as a JSON number, or
		// omit it. Downstream sort uses localeCompare, so node must be a string.
		const raw: TableSizeRecord[] = [
			{ metric: 'table-size', database: 'd', table: 't', node: 1, id: 1, size: 100 },
			{ metric: 'table-size', database: 'd', table: 't', node: null, id: 2, size: 200 },
			// node omitted entirely (single-instance Harper) → undefined.
			{ metric: 'table-size', database: 'd', table: 't', id: 3, size: 300 },
			{ metric: 'table-size', database: 'd', table: 't', node: 'n4', id: 4, size: 400 },
		];
		const normalized = normalizeRecords(raw);
		expect(normalized.every((r) => typeof r.node === 'string')).toBeTruthy();
		expect(normalized.map((r) => r.node)).toEqual(['1', '', '', 'n4']);
	});
});

describe('dedupRecords', () => {
	it('drops consecutive unchanged-size repeats per (node, tableKey)', () => {
		const raw: TableSizeRecord[] = [
			{ metric: 'table-size', database: 'd', table: 't', node: 'n1', id: 1, size: 100 },
			{ metric: 'table-size', database: 'd', table: 't', node: 'n1', id: 2, size: 100 },
			{ metric: 'table-size', database: 'd', table: 't', node: 'n1', id: 3, size: 100 },
			{ metric: 'table-size', database: 'd', table: 't', node: 'n1', id: 4, size: 200 },
			{ metric: 'table-size', database: 'd', table: 't', node: 'n1', id: 5, size: 200 },
		];
		const normalized = normalizeRecords(raw);
		const deduped = dedupRecords(normalized);
		expect(deduped.length).toBe(2);
		expect(deduped[0].size).toBe(100);
		expect(deduped[0].time).toBe(1);
		expect(deduped[1].size).toBe(200);
		expect(deduped[1].time).toBe(4);
	});

	it('keeps repeats across different (node, tableKey) combinations', () => {
		const raw: TableSizeRecord[] = [
			{ metric: 'table-size', database: 'd', table: 't', node: 'n1', id: 1, size: 100 },
			{ metric: 'table-size', database: 'd', table: 't', node: 'n2', id: 1, size: 100 },
			{ metric: 'table-size', database: 'd', table: 'u', node: 'n1', id: 1, size: 100 },
		];
		const deduped = dedupRecords(normalizeRecords(raw));
		expect(deduped.length).toBe(3);
	});
});

describe('toTableKey', () => {
	it('produces database.table format', () => {
		expect(toTableKey({ database: 'data', table: 'users' })).toBe('data.users');
	});
});

describe('computeTableSet', () => {
	it('keeps all tables with no rollup when count <= TOP_N + 1', () => {
		const normalized = normalizeRecords(fixture('growth-window'));
		const { tableSet, hasOther, otherMembers } = computeTableSet(normalized);
		// 3 tables in this fixture; top-N=8, so all are in the set.
		expect(tableSet.length).toBe(3);
		expect(hasOther).toBe(false);
		expect(otherMembers).toEqual([]);
	});

	it('returns empty set when all tables are below the meaningful threshold', () => {
		// all-other fixture: every table <= 4096 bytes
		const normalized = normalizeRecords(fixture('all-other'));
		const { tableSet, hasOther, otherMembers } = computeTableSet(normalized);
		expect(tableSet.length).toBe(0);
		expect(hasOther).toBe(true);
		expect(otherMembers.length >= 1).toBeTruthy();
	});

	it('ranks tables by max-per-node size, not cluster-wide max', () => {
		// Synthesize: tableA=5MB on n1 only (absent elsewhere);
		// tableB through tableI each at 1MB on all 10 nodes.
		// Make sure A survives top-N even though it's present on only one node.
		const raw: TableSizeRecord[] = [
			{ metric: 'table-size', database: 'd', table: 'A', node: 'n1', id: 1, size: 5_000_000 },
		];
		// 8 tables each 1MB across 10 nodes
		for (const t of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) {
			for (let i = 1; i <= 10; i++) {
				raw.push({ metric: 'table-size', database: 'd', table: t, node: `n${i}`, id: 1, size: 1_000_000 });
			}
		}
		const normalized = normalizeRecords(raw);
		const { tableSet, hasOther } = computeTableSet(normalized);
		expect(tableSet.includes('d.A'), 'node-local hotspot must be in tableSet').toBeTruthy();
		// With 9 meaningful tables and TOP_N=8, the "exactly one rolled up stays
		// inline" rule keeps all 9. Size is bounded by TOP_N+1.
		expect(tableSet.length <= TOP_N + 1).toBeTruthy();
		expect(hasOther).toBe(false);
		expect(tableSet.length).toBe(9);
	});

	it('rolls up more than one below-top table into Other', () => {
		// 10 tables: top 8 at 10MB, bottom 2 at 1MB.
		const raw: TableSizeRecord[] = [];
		const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'Y', 'Z'];
		for (const t of letters) {
			const size = ['Y', 'Z'].includes(t) ? 1_000_000 : 10_000_000;
			raw.push({ metric: 'table-size', database: 'd', table: t, node: 'n1', id: 1, size });
		}
		const { tableSet, hasOther, otherMembers } = computeTableSet(normalizeRecords(raw));
		expect(tableSet.length).toBe(TOP_N);
		expect(hasOther).toBe(true);
		expect(otherMembers.sort()).toEqual(['d.Y', 'd.Z']);
	});

	it('breaks ties alphabetically on database.table', () => {
		// Sizes must exceed MEANINGFUL_SIZE_THRESHOLD (4096) to qualify for top-N;
		// both tables tie on size so the tie-break is alphabetical.
		const raw: TableSizeRecord[] = [
			{ metric: 'table-size', database: 'd', table: 'beta', node: 'n1', id: 1, size: 5000 },
			{ metric: 'table-size', database: 'd', table: 'alpha', node: 'n1', id: 1, size: 5000 },
		];
		const { tableSet } = computeTableSet(normalizeRecords(raw));
		expect(tableSet).toEqual(['d.alpha', 'd.beta']);
	});

	it('folds below-threshold tables into Other even when top-N has meaningful entries', () => {
		// Mirrors the live cluster: one growing table + several static 4 KB tables.
		// The static tables must not vanish silently — they belong in Other.
		const raw: TableSizeRecord[] = [
			{ metric: 'table-size', database: 'd', table: 'grower', node: 'n1', id: 1, size: 10_000_000 },
			{ metric: 'table-size', database: 'd', table: 'static1', node: 'n1', id: 1, size: 4096 },
			{ metric: 'table-size', database: 'd', table: 'static2', node: 'n1', id: 1, size: 4096 },
			{ metric: 'table-size', database: 'd', table: 'empty', node: 'n1', id: 1, size: 0 },
		];
		const { tableSet, hasOther, otherMembers } = computeTableSet(normalizeRecords(raw));
		expect(tableSet).toEqual(['d.grower']);
		expect(hasOther).toBe(true);
		expect(otherMembers.sort()).toEqual(['d.empty', 'd.static1', 'd.static2']);
	});
});

describe('computeSnapshot', () => {
	it('produces one entry per node with stacks limited to tableSet + Other', () => {
		const raw: TableSizeRecord[] = [];
		// 10 tables: top 8 on n1 and n2; two below the cutoff for Other.
		const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'Y', 'Z'];
		for (const t of letters) {
			for (const node of ['n1', 'n2']) {
				const size = ['Y', 'Z'].includes(t) ? 1_000_000 : 10_000_000;
				raw.push({ metric: 'table-size', database: 'd', table: t, node, id: 1, size });
			}
		}
		const normalized = normalizeRecords(raw);
		const { tableSet, hasOther } = computeTableSet(normalized);
		const rows = computeSnapshot(normalized, tableSet, hasOther);
		expect(rows.length).toBe(2);
		for (const row of rows) {
			// 8 top-N + 1 Other = 9 entries
			expect(Object.keys(row.stacks).length).toBe(9);
			expect('__other__' in row.stacks).toBeTruthy();
			// Other = 2 tables × 1_000_000
			expect(row.stacks.__other__).toBe(2_000_000);
			// Total = full sum across ALL tables (8×10M + 2×1M)
			expect(row.total).toBe(82_000_000);
		}
	});

	it('omits missing (node, table) pairs from stacks (no zero-height fillers)', () => {
		const normalized = normalizeRecords(fixture('sparse-per-node'));
		const { tableSet, hasOther } = computeTableSet(normalized);
		const rows = computeSnapshot(normalized, tableSet, hasOther);
		const n2 = rows.find((r) => r.node === 'n2')!;
		// n2 does not have onlyOnN1 data → key should be absent from stacks.
		expect(!('d.onlyOnN1' in n2.stacks)).toBeTruthy();
		expect('d.common' in n2.stacks).toBeTruthy();
	});

	it('uses the latest size per (node, tableKey) in the window', () => {
		const normalized = normalizeRecords(fixture('growth-window'));
		const { tableSet, hasOther } = computeTableSet(normalized);
		const rows = computeSnapshot(normalized, tableSet, hasOther);
		const n1 = rows.find((r) => r.node === 'n1')!;
		// grower's latest on n1 is 2_000_000
		expect(n1.stacks['d.grower']).toBe(2_000_000);
	});

	it('returns [] when no records exist', () => {
		expect(computeSnapshot([], [], false)).toEqual([]);
	});
});

describe('computeBucketMs', () => {
	it('returns 60_000 for short windows', () => {
		expect(computeBucketMs(60_000)).toBe(60_000); // 1 min window
		expect(computeBucketMs(5 * 60_000)).toBe(60_000); // 5 min window (would compute ~3333, clamped)
	});

	it('scales to target ~60-120 buckets for longer windows', () => {
		const day = 24 * 60 * 60 * 1000;
		const b = computeBucketMs(day);
		const bucketsInWindow = day / b;
		expect(
			bucketsInWindow >= 60 && bucketsInWindow <= 120,
			`expected 60-120 buckets for 1-day window, got ${bucketsInWindow}`,
		).toBeTruthy();
	});

	it('scales to target ~60-120 buckets for 1-week window', () => {
		const week = 7 * 24 * 60 * 60 * 1000;
		const b = computeBucketMs(week);
		const bucketsInWindow = week / b;
		expect(bucketsInWindow >= 60 && bucketsInWindow <= 120).toBeTruthy();
	});
});

describe('computeTrendFactory', () => {
	const range = { startTime: 1_700_000_000_000, endTime: 1_700_000_300_000 }; // 5 minutes
	// With 5-min window, bucketMs = 60_000 (1-min floor).

	it('returns latest sample per (bucket, node)', () => {
		const normalized = normalizeRecords(fixture('node-drop'));
		const trend = computeTrendFactory(normalized, range);
		const points = trend('d.T');
		// We expect buckets at 1700000000000, 1700000060000, 1700000120000, 1700000180000 (from n1 samples).
		expect(points.length >= 3).toBeTruthy();
		const first = points.find((p) => p.time === 1_700_000_000_000)!;
		expect(first).toBeTruthy();
		expect(first.values.n1).toBe(100000);
		expect(first.values.n2).toBe(200000);
	});

	it('omits nodes that have no samples for the selected table', () => {
		const normalized = normalizeRecords(fixture('sparse-per-node'));
		const trend = computeTrendFactory(normalized, range);
		const points = trend('d.onlyOnN1');
		// n2 is absent from this table's trend.
		for (const p of points) {
			expect(!('n2' in p.values)).toBeTruthy();
		}
	});

	it('dropped node: trend only has values until that node stopped sampling', () => {
		const normalized = normalizeRecords(fixture('node-drop'));
		const trend = computeTrendFactory(normalized, range);
		const points = trend('d.T');
		// n2 has its last sample at t=60_000_ms after start. No bucket past that should contain n2.
		const n2PastLastSample = points
			.filter((p) => p.time > 1_700_000_060_000)
			.some((p) => 'n2' in p.values);
		expect(n2PastLastSample).toBe(false);
	});

	it('returns [] for a table with no data', () => {
		const normalized = normalizeRecords(fixture('growth-window'));
		const trend = computeTrendFactory(normalized, range);
		expect(trend('d.nonexistent')).toEqual([]);
	});

	it('resolves ties within a bucket to the latest sample per node', () => {
		const raw: TableSizeRecord[] = [
			{ metric: 'table-size', database: 'd', table: 't', node: 'n1', id: 1_700_000_000_100, size: 100 },
			{ metric: 'table-size', database: 'd', table: 't', node: 'n1', id: 1_700_000_000_500, size: 200 }, // same bucket
		];
		const trend = computeTrendFactory(normalizeRecords(raw), range);
		const points = trend('d.t');
		expect(points[0].values.n1).toBe(200); // latest within bucket wins
	});
});

describe('computeDefaultSelection', () => {
	it("rankBy='bytes' picks the table with the largest max−min per node", () => {
		const normalized = normalizeRecords(fixture('growth-window'));
		// grower: delta = 1_000_000 (on any node). flat: delta = 0. fastPctGrower: delta = 101_376.
		// Absolute wins: grower.
		expect(computeDefaultSelection(normalized, 'bytes')).toBe('d.grower');
	});

	it("rankBy='percent' surfaces the fast-growing small table", () => {
		const normalized = normalizeRecords(fixture('growth-window'));
		// fastPctGrower: (102400-1024)/102400 ≈ 0.99. grower: (2M-1M)/2M = 0.5. Wins: fastPctGrower.
		expect(computeDefaultSelection(normalized, 'percent')).toBe('d.fastPctGrower');
	});

	it('falls back to max(size) on flat windows', () => {
		const normalized = normalizeRecords(fixture('flat-window'));
		// c has the largest size (700000); a=500000; b=300000.
		expect(computeDefaultSelection(normalized, 'bytes')).toBe('d.c');
		expect(computeDefaultSelection(normalized, 'percent')).toBe('d.c');
	});

	it('breaks ties alphabetically on database.table', () => {
		const normalized = normalizeRecords(fixture('tie-break'));
		// beta and alpha both have delta=5000 and identical sizes → alphabetical wins: alpha.
		expect(computeDefaultSelection(normalized, 'bytes')).toBe('d.alpha');
	});

	it('is idempotent across repeated calls', () => {
		const normalized = normalizeRecords(fixture('tie-break'));
		expect(computeDefaultSelection(normalized, 'bytes')).toBe(computeDefaultSelection(normalized, 'bytes'));
	});

	it('returns null when there is no data', () => {
		expect(computeDefaultSelection([], 'bytes')).toBe(null);
	});
});

describe('buildDerived', () => {
	const range = { startTime: 1_700_000_000_000, endTime: 1_700_000_300_000 };

	it('emptyCause="upstream-empty" when there are no records', () => {
		const d = buildDerived([], range);
		expect(d.emptyCause).toBe('upstream-empty');
		expect(d.snapshot.tableSet.length).toBe(0);
		expect(d.defaultSelection('bytes')).toBe(null);
	});

	it('emptyCause="all-other" when all tables are below the threshold', () => {
		const d = buildDerived(fixture('all-other'), range);
		expect(d.emptyCause).toBe('all-other');
		expect(d.snapshot.tableSet.length).toBe(0);
		expect(d.snapshot.hasOther).toBe(true);
	});

	it('emptyCause=null when there are top-N tables', () => {
		const d = buildDerived(fixture('growth-window'), range);
		expect(d.emptyCause).toBe(null);
		expect(d.snapshot.tableSet.length > 0).toBeTruthy();
	});

	it('signature is stable across identical inputs and different across different inputs', () => {
		const d1 = buildDerived(fixture('growth-window'), range);
		const d2 = buildDerived(fixture('growth-window'), range);
		expect(d1.signature).toBe(d2.signature);

		const d3 = buildDerived(fixture('tie-break'), range);
		expect(d1.signature).not.toBe(d3.signature);
	});

	it('trend(selectedTable) returns expected shape', () => {
		const d = buildDerived(fixture('growth-window'), range);
		const points = d.trend('d.grower');
		expect(points.length > 0).toBeTruthy();
		expect('time' in points[0]).toBeTruthy();
		expect('values' in points[0]).toBeTruthy();
	});
});

describe('buildDerived memo stability', () => {
	const range = { startTime: 1_700_000_000_000, endTime: 1_700_000_300_000 };

	it('produces equal signatures for content-equal inputs', () => {
		const a = buildDerived(fixture('growth-window'), range);
		// Make a fresh copy — different array reference, same content
		const copy = JSON.parse(JSON.stringify(fixture('growth-window')));
		const b = buildDerived(copy, range);
		expect(a.signature).toBe(b.signature);
	});

	it('produces different signatures when windows differ', () => {
		const a = buildDerived(fixture('growth-window'), range);
		const b = buildDerived(fixture('growth-window'), {
			startTime: range.startTime + 1,
			endTime: range.endTime,
		});
		expect(a.signature).not.toBe(b.signature);
	});
});

describe('resolveSelection', () => {
	const snapshot: Snapshot = {
		byNode: [],
		tableSet: ['d.a', 'd.b', 'd.c'],
		hasOther: false,
		otherMembers: [],
	};
	const defaultSelection = (_r: 'bytes' | 'percent') => 'd.b';

	it('preserves a manual selection that is still in tableSet', () => {
		const out = resolveSelection({
			prev: 'd.c',
			snapshot,
			rankBy: 'bytes',
			isManual: true,
			defaultSelection,
		});
		expect(out).toEqual({ nextTable: 'd.c', nextManual: true });
	});

	it('falls back to default when a manual selection has disappeared', () => {
		const out = resolveSelection({
			prev: 'd.gone',
			snapshot,
			rankBy: 'bytes',
			isManual: true,
			defaultSelection,
		});
		expect(out).toEqual({ nextTable: 'd.b', nextManual: false });
	});

	it('auto-selects when isManual is false', () => {
		const out = resolveSelection({
			prev: 'd.c',
			snapshot,
			rankBy: 'bytes',
			isManual: false,
			defaultSelection,
		});
		expect(out).toEqual({ nextTable: 'd.b', nextManual: false });
	});

	it('auto-selects on the initial load (prev=null)', () => {
		const out = resolveSelection({
			prev: null,
			snapshot,
			rankBy: 'bytes',
			isManual: false,
			defaultSelection,
		});
		expect(out).toEqual({ nextTable: 'd.b', nextManual: false });
	});

	it('passes the current rankBy through to defaultSelection', () => {
		const calls: Array<'bytes' | 'percent'> = [];
		resolveSelection({
			prev: null,
			snapshot,
			rankBy: 'percent',
			isManual: false,
			defaultSelection: (r) => {
				calls.push(r);
				return null;
			},
		});
		expect(calls).toEqual(['percent']);
	});
});

describe('computeGrowthAnnotation', () => {
	const fakeBytes = (n: number) => `${n}B`;
	const points = (vals: Array<[number, number]>): Array<{ time: number; values: Record<string, number> }> =>
		vals.map(([time, v]) => ({ time, values: { n1: v } }));

	it('returns empty string when fewer than 2 samples', () => {
		expect(computeGrowthAnnotation({
			points: points([[0, 100]]),
			node: 'n1',
			windowMs: 3_600_000,
			rankBy: 'bytes',
			formatBytes: fakeBytes,
		})).toBe('');
	});

	it('returns empty string when there is no change (delta=0)', () => {
		expect(computeGrowthAnnotation({
			points: points([[0, 100], [1, 100], [2, 100]]),
			node: 'n1',
			windowMs: 3_600_000,
			rankBy: 'bytes',
			formatBytes: fakeBytes,
		})).toBe('');
	});

	it("rankBy='bytes' uses windowMs for the /hr denominator", () => {
		// 100 MB delta over a 168h window should report ~0.6 MB/hr, NOT 100MB/hr
		// (which is what the old version reported when samples were clustered).
		const windowMs = 168 * 60 * 60 * 1000;
		const fmt = (n: number) => `${Math.round(n / 1_000_000)}MB`;
		const out = computeGrowthAnnotation({
			points: points([[0, 0], [1, 100_000_000]]),
			node: 'n1',
			windowMs,
			rankBy: 'bytes',
			formatBytes: fmt,
		});
		// delta = 100_000_000, perHr ≈ 595_238 → ~1MB with the rough rounding
		expect(out.startsWith('+100MB'), `expected bytes delta in output, got ${out}`).toBeTruthy();
		expect(out.includes('/hr'), `expected /hr suffix, got ${out}`).toBeTruthy();
	});

	it("rankBy='percent' drops /hr and reports %/window", () => {
		const out = computeGrowthAnnotation({
			points: points([[0, 1000], [1, 2000]]),
			node: 'n1',
			windowMs: 3_600_000,
			rankBy: 'percent',
			formatBytes: fakeBytes,
		});
		expect(out).toBe('+50.0%/window');
	});

	it("rankBy='bytes' returns '' when windowMs <= 0 (inverted range)", () => {
		expect(computeGrowthAnnotation({
			points: points([[0, 100], [1, 200]]),
			node: 'n1',
			windowMs: 0,
			rankBy: 'bytes',
			formatBytes: fakeBytes,
		})).toBe('');
	});

	it('ignores nodes not present in points', () => {
		expect(computeGrowthAnnotation({
			points: points([[0, 100], [1, 200]]),
			node: 'n2',
			windowMs: 3_600_000,
			rankBy: 'bytes',
			formatBytes: fakeBytes,
		})).toBe('');
	});
});

describe('emptyCauseToFlags', () => {
	it('upstream-empty routes to isEmpty', () => {
		expect(emptyCauseToFlags('upstream-empty')).toEqual({
			isEmpty: true,
			allOtherHint: false,
		});
	});

	it('all-other routes to allOtherHint', () => {
		expect(emptyCauseToFlags('all-other')).toEqual({
			isEmpty: false,
			allOtherHint: true,
		});
	});

	it('null routes to neither', () => {
		expect(emptyCauseToFlags(null)).toEqual({
			isEmpty: false,
			allOtherHint: false,
		});
	});
});
