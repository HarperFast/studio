// Regression coverage for the render-layer half of #1576.
//
// The pipeline fix bounded carry-forward for cross-node gauge *sums*, which is
// what "Stack by: Type" renders. "Stack by: Node" never went through that code
// path at all: the renderer remaps the spec's dimension to 'node', so each
// series holds exactly one node and the pipeline's carry-forward — which never
// invents bucket times — is a structural no-op. The only thing stitching those
// bands across the lattice is StackedAreaChart's own forward-fill, and it was
// unbounded, so an idle node's band was carried for the rest of the window.
//
// The staggered shapes below mirror cross-node-gauge-gaps.test.ts: `period: 0`
// gauge rows on a 90 s emission cadence, snapped onto the spec's 60 s fallback
// lattice, two nodes half a cadence out of phase.
import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../pipeline/pipeline';
import { wrapperMetrics } from '../../pipeline/wrapperMetrics';
import { mergeStackedRows, type StackedRow } from '../../primitives/mergeStackedRows';
import type { AnalyticsDataPoint, MetricSpec, SeriesData, TimeRange } from '../../types/analytics';

/** `spec.bucket.fallbackMs` — what `period: 0` degrades to, and so the lattice
 *  every gauge row here is snapped onto. */
const LATTICE = 60_000;
/** Emission cadence observed on the reporting instance. 90 mod 60 = 30, which
 *  is what makes the nodes' snapped buckets beat against the lattice. */
const CADENCE = 90_000;
/** Lattice-aligned epoch, so every snapped bucket below is exact. */
const T0 = 28_333_334 * LATTICE;
/** Half a cadence — the second node's phase offset. */
const PHASE = CADENCE / 2;

const BUSY = 285; // us-west-1's steady connection count
const QUIET = 3; // Milan's, while it had any at all

const WINDOW: TimeRange = { startTime: T0 - LATTICE, endTime: T0 + 100 * CADENCE };
const NODES = ['busy', 'quiet'];

/** Round-to-nearest, matching the pipeline's `snapToBucketTime`. */
const snap = (t: number) => Math.round(t / LATTICE) * LATTICE;

/** The dimension remap TrafficByTypeRenderer applies for "Stack by: Node". */
function stackByNode(spec: MetricSpec): MetricSpec {
	if (spec.series.kind !== 'groupBy') { throw new Error('expected a groupBy spec'); }
	return { ...spec, series: { ...spec.series, dimension: 'node' } };
}

const connectionsByNode = stackByNode(wrapperMetrics['connections'].spec);
const bytesSentByNode = stackByNode(wrapperMetrics['bytes-sent'].spec);

function connectionRow(node: string, time: number, connections: number): AnalyticsDataPoint {
	// `period: 0` is what harper-pro stamps on gauge rows.
	return { metric: 'mqtt-connections', type: 'mqtt', node, time, connections, count: 1, period: 0 };
}

/** Two nodes on the same cadence, half a period out of phase. `busy` reports for
 *  every one of `samples`; `quiet` reports for its first `quietSamples` and then
 *  goes silent, which is what core's `> 0` guard does to an idle node. */
function staggeredCluster(samples: number, quietSamples: number): AnalyticsDataPoint[] {
	const rows: AnalyticsDataPoint[] = [];
	for (let i = 0; i < samples; i++) {
		rows.push(connectionRow('busy', T0 + i * CADENCE, BUSY));
	}
	for (let j = 0; j < quietSamples; j++) {
		rows.push(connectionRow('quiet', T0 + PHASE + j * CADENCE, QUIET));
	}
	return rows;
}

const byX = (rows: StackedRow[]) => new Map(rows.map((r) => [r.x, r]));

const nodeStack = (spec: MetricSpec, rows: AnalyticsDataPoint[], nodes = NODES): SeriesData =>
	runPipeline(spec, rows, WINDOW, nodes, { snapToPeriod: true });

describe('stack-by-node — the render-layer fill is the only thing bridging the lattice', () => {
	const SAMPLES = 40;
	const data = nodeStack(connectionsByNode, staggeredCluster(SAMPLES, SAMPLES));

	it('leaves each node reporting on only part of the shared lattice', () => {
		// Guard on the setup: if the lattice/phase arithmetic ever stopped producing
		// ragged per-node coverage, everything below would pass vacuously.
		const xs = new Set(data.series.flatMap((s) => s.points.map((p) => p.x)));
		expect(data.series.length).toBe(2);
		for (const s of data.series) {
			expect(s.points.length, `${s.key} covers the full lattice`).toBeLessThan(xs.size);
		}
	});

	it('gives the pipeline no cross-node sum to carry — each series holds one node', () => {
		// This is why the bound has to be reimplemented at the render layer: with
		// dimension 'node' every bucket of a series has its own node present, so
		// pipeline carry-forward has nothing to fill.
		for (const s of data.series) {
			expect(s.node).toBe(s.key);
			const expected = s.key === 'busy' ? BUSY : QUIET;
			expect(s.points.map((p) => p.y)).toEqual(s.points.map(() => expected));
		}
	});

	it('fills both bands at every lattice position once each node has been seen', () => {
		const merged = mergeStackedRows(data);
		const quietFirst = snap(T0 + PHASE);
		expect(merged.length).toBeGreaterThan(SAMPLES);
		for (const row of merged) {
			expect(row.busy, `busy @ ${row.x}`).toBe(BUSY);
			// LOCF only looks backwards — the quiet node's first row is half a
			// cadence after T0, so the opening bucket is legitimately busy alone.
			expect(row.quiet, `quiet @ ${row.x}`).toBe(row.x! < quietFirst ? null : QUIET);
		}
	});
});

describe('stack-by-node — an idle node stops contributing to the stack', () => {
	const SAMPLES = 40;
	const QUIET_SAMPLES = 5;
	const data = nodeStack(connectionsByNode, staggeredCluster(SAMPLES, QUIET_SAMPLES));
	const merged = mergeStackedRows(data);
	const lastQuiet = snap(T0 + PHASE + (QUIET_SAMPLES - 1) * CADENCE);

	it('drops the quiet band to 0 once its last sample is far enough behind', () => {
		// Pre-fix these positions all read QUIET — the band was carried to the
		// right-hand edge of the window, overstating the cluster total forever.
		const stale = merged.filter((r) => r.x! > lastQuiet + 10 * LATTICE);
		expect(stale.length).toBeGreaterThan(0);
		for (const row of stale) {
			expect(row.quiet, `quiet @ ${row.x}`).toBe(0);
			expect(row.busy, `busy @ ${row.x}`).toBe(BUSY);
		}
	});

	it('still bridges the positions the quiet node skipped while it was reporting', () => {
		const bridged = merged.filter((r) => r.x! > snap(T0 + PHASE) && r.x! <= lastQuiet);
		expect(bridged.length).toBeGreaterThan(0);
		for (const row of bridged) {
			expect(row.quiet, `quiet @ ${row.x}`).toBe(QUIET);
		}
	});

	it('never brings the band back once it has expired', () => {
		// A band that flickered 0 → QUIET → 0 would read as a node reconnecting.
		const firstZero = merged.findIndex((r) => r.quiet === 0);
		expect(firstZero).toBeGreaterThan(0);
		for (const row of merged.slice(firstZero)) {
			expect(row.quiet, `quiet @ ${row.x}`).toBe(0);
		}
	});
});

describe('bounded carry-forward — exact horizon', () => {
	// Uniform 60 ms lattice so the arithmetic is checkable by hand: 'b' reports
	// three times and stops. Its median gap is 60 and the lattice step is 60, so
	// its horizon is STALENESS_INTERVALS × 60 + one step of snap slack = 180.
	const data: SeriesData = {
		series: [
			{ key: 'a', label: 'A', points: Array.from({ length: 11 }, (_, i) => ({ x: i * 60, y: 100 })) },
			{ key: 'b', label: 'B', points: [0, 60, 120].map((x) => ({ x, y: 10 })) },
		],
	};
	const rows = byX(mergeStackedRows(data));

	it('carries right up to the horizon and no further', () => {
		expect(rows.get(120)!.b, 'observed').toBe(10);
		expect(rows.get(240)!.b, '120 stale — inside the horizon').toBe(10);
		expect(rows.get(300)!.b, '180 stale — exactly at the horizon').toBe(10);
		expect(rows.get(360)!.b, '240 stale — past the horizon').toBe(0);
		expect(rows.get(600)!.b).toBe(0);
	});

	it('leaves the series that kept reporting untouched', () => {
		for (const row of rows.values()) {
			expect(row.a, `a @ ${row.x}`).toBe(100);
		}
	});
});

describe('bounded carry-forward — values the fill must not invent', () => {
	const spine = Array.from({ length: 11 }, (_, i) => ({ x: i * 60, y: 100 }));

	it('passes an observed value through, including a genuine drop to 0', () => {
		// A real disconnect reports 0 rather than going absent, so the fill must
		// never round it back up to the previous reading.
		const rows = byX(mergeStackedRows({
			series: [
				{ key: 'a', label: 'A', points: spine },
				{ key: 'b', label: 'B', points: [{ x: 0, y: 10 }, { x: 60, y: 0 }, { x: 120, y: 7 }] },
			],
		}));
		expect([rows.get(0)!.b, rows.get(60)!.b, rows.get(120)!.b]).toEqual([10, 0, 7]);
	});

	it('does not back-fill positions before a series first reported', () => {
		const rows = byX(mergeStackedRows({
			series: [
				{ key: 'a', label: 'A', points: spine },
				{ key: 'b', label: 'B', points: [{ x: 300, y: 10 }] },
			],
		}));
		expect([rows.get(0)!.b, rows.get(240)!.b]).toEqual([null, null]);
		expect(rows.get(300)!.b).toBe(10);
	});

	it('keeps a point that reported no value null, and carries nothing from it', () => {
		// `y: null` is an aggregate that had no valid inputs — a known unknown,
		// which is not the same as a series that has gone to zero.
		const rows = byX(mergeStackedRows({
			series: [
				{ key: 'a', label: 'A', points: spine },
				{ key: 'b', label: 'B', points: [{ x: 0, y: 10 }, { x: 60, y: null }] },
			],
		}));
		expect([rows.get(60)!.b, rows.get(120)!.b, rows.get(600)!.b]).toEqual([null, null, null]);
	});

	it('invents no rows when every series stops, so a cluster-wide gap cannot read as 0', () => {
		// x positions come only from series that actually reported. If everything
		// goes quiet the rows stop, and the chart shows a gap rather than a stack
		// of zeros.
		const merged = mergeStackedRows({
			series: [
				{ key: 'a', label: 'A', points: [{ x: 0, y: 100 }, { x: 60, y: 100 }] },
				{ key: 'b', label: 'B', points: [{ x: 0, y: 10 }, { x: 60, y: 10 }] },
			],
		});
		expect(merged.map((r) => r.x)).toEqual([0, 60]);
		expect(merged.flatMap((r) => [r.a, r.b])).toEqual([100, 10, 100, 10]);
	});

	it('carries the ceiling unbounded — it is a reference line, not a band', () => {
		// A memory-style ceiling that expired to 0 would draw a limit of nothing.
		const merged = mergeStackedRows({
			series: [{ key: 'a', label: 'A', points: spine }],
			ceiling: { key: 'cap', label: 'Max', points: [{ x: 0, y: 4096 }] },
		});
		expect(merged.map((r) => r.__ceiling__)).toEqual(merged.map(() => 4096));
	});

	it('handles a single-point series without expiring it against a zero horizon', () => {
		const merged = mergeStackedRows({ series: [{ key: 'a', label: 'A', points: [{ x: 0, y: 100 }] }] });
		expect(merged).toEqual([{ x: 0, a: 100 }]);
	});
});

describe('bytes-sent — a node that stops sending reads 0, not its last rate', () => {
	// sum/sum, so the pipeline deliberately excludes it from carry-forward. The
	// render layer still has to fill the positions a node skipped, and past the
	// horizon 0 is the honest value for a rate: carrying the last throughput on
	// would keep drawing traffic that stopped.
	const bytesRow = (node: string, time: number, bytes: number): AnalyticsDataPoint =>
		({
			metric: 'bytes-sent',
			type: 'egress',
			node,
			time,
			count: 1,
			mean: bytes,
			period: LATTICE,
		}) as AnalyticsDataPoint;
	// rate = count × mean / period × 1000 = 60_000 / 60_000 × 1000 = 1000 B/s
	const RATE = 1_000;

	const rows: AnalyticsDataPoint[] = [];
	for (let i = 0; i <= 20; i++) { rows.push(bytesRow('n1', T0 + i * LATTICE, 60_000)); }
	for (let i = 0; i <= 2; i++) { rows.push(bytesRow('n2', T0 + i * LATTICE, 60_000)); }

	const merged = byX(mergeStackedRows(nodeStack(bytesSentByNode, rows, ['n1', 'n2'])));

	it('still bridges a position inside the horizon', () => {
		// n2's cadence and the lattice are both 60 s → horizon 180 s.
		expect(merged.get(T0 + 3 * LATTICE)!.n2).toBe(RATE);
	});

	it('stops drawing the departed node once its last sample ages out', () => {
		expect(merged.get(T0 + 10 * LATTICE)!.n2).toBe(0);
		expect(merged.get(T0 + 20 * LATTICE)!.n2).toBe(0);
		expect(merged.get(T0 + 20 * LATTICE)!.n1).toBe(RATE);
	});
});
