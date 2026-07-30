// Regression coverage for #1576 — the Connections panel dove to ~0 whenever a
// single time bucket held only one node of the cluster.
//
// The pre-existing connections/database-size suites only exercise uniform
// `period: 60000` rows with every node present at every timestamp, so the
// artifact could not surface there. These cases reproduce the reported shape:
// `period: 0` rows on a 90 s emission cadence, snapped onto the spec's 60 s
// fallback lattice, with the two nodes half a cadence out of phase.
import { describe, expect, it } from 'vitest';
import { MAX_STALENESS_MS } from '../../pipeline/carryForward';
import { runPipeline } from '../../pipeline/pipeline';
import { wrapperMetrics } from '../../pipeline/wrapperMetrics';
import type { AnalyticsDataPoint, SeriesPoint, TimeRange } from '../../types/analytics';
import nodeDrop from '../fixtures/connections/node-drop.json';

const connectionsSpec = wrapperMetrics['connections'].spec;
const databaseSizeSpec = wrapperMetrics['database-size'].spec;
const bytesSentSpec = wrapperMetrics['bytes-sent'].spec;

/** `spec.bucket.fallbackMs` — what `period: 0` degrades to, and therefore the
 *  lattice every one of these rows gets snapped onto. */
const LATTICE = 60_000;
/** Emission cadence observed on the reporting instance (90 s, despite
 *  `analytics.aggregatePeriod: 60`). 90 mod 60 = 30, which is what makes the
 *  two nodes' snapped buckets beat against the lattice. */
const CADENCE = 90_000;
/** Lattice-aligned epoch, so every snapped bucket below is exact. */
const T0 = 28_333_334 * LATTICE;
/** Half a cadence — the second node's phase offset. */
const PHASE = CADENCE / 2;

const BUSY = 285; // us-west-1's steady connection count
const QUIET = 3; // Milan's, while it had any at all

const WINDOW: TimeRange = { startTime: T0 - LATTICE, endTime: T0 + 100 * CADENCE };

/** Round-to-nearest, matching the pipeline's `snapToBucketTime`. */
const snap = (t: number) => Math.round(t / LATTICE) * LATTICE;

function connectionRow(node: string, time: number, connections: number): AnalyticsDataPoint {
	// `period: 0` is what harper-pro stamps on gauge rows — no aggregation
	// period, which is the root of the lattice mismatch.
	return { metric: 'mqtt-connections', type: 'mqtt', node, time, connections, count: 1, period: 0 };
}

/** Two nodes on the same cadence, out of phase: `busy` never misses a period,
 *  `quiet` reports only on the sample indices given. */
function staggeredCluster(samples: number, quietIndices: readonly number[]): AnalyticsDataPoint[] {
	const rows: AnalyticsDataPoint[] = [];
	for (let i = 0; i < samples; i++) {
		rows.push(connectionRow('busy', T0 + i * CADENCE, BUSY));
	}
	for (const j of quietIndices) {
		rows.push(connectionRow('quiet', T0 + PHASE + j * CADENCE, QUIET));
	}
	return rows;
}

/** Buckets holding rows from exactly one node — the ones that used to render
 *  as a vertical dive to that node's own value. */
function soloNodeBuckets(rows: AnalyticsDataPoint[]): number[] {
	const byBucket = new Map<number, Set<string>>();
	for (const r of rows) {
		const b = snap(r.time);
		const nodes = byBucket.get(b) ?? new Set<string>();
		nodes.add(r.node);
		byBucket.set(b, nodes);
	}
	return [...byBucket.entries()].filter(([, nodes]) => nodes.size === 1).map(([b]) => b).sort((a, b) => a - b);
}

const mqttPoints = (rows: AnalyticsDataPoint[]): SeriesPoint[] => {
	const out = runPipeline(connectionsSpec, rows, WINDOW, ['busy', 'quiet'], { snapToPeriod: true });
	return out.series.find((s) => s.key === 'mqtt')!.points;
};

describe('connections — staggered per-node cadence (#1576)', () => {
	const SAMPLES = 40;
	// Quiet node present for every period it could be: the raggedness here comes
	// purely from phase, not from core's `> 0` guard.
	const rows = staggeredCluster(SAMPLES, [...Array(SAMPLES).keys()]);

	it('the fixture really does produce single-node buckets', () => {
		// Guard on the setup itself — if the lattice/phase arithmetic ever stops
		// producing solo buckets, the assertions below would pass vacuously.
		const solo = soloNodeBuckets(rows);
		expect(solo.length).toBeGreaterThan(0);
		// Both directions occur: buckets with only `busy`, and the ones that
		// caused the reported dives, with only `quiet`.
		const quietOnly = solo.filter((b) => rows.some((r) => snap(r.time) === b && r.node === 'quiet'));
		expect(quietOnly.length).toBeGreaterThan(0);
	});

	it('never renders the cluster total as one node alone', () => {
		const points = mqttPoints(rows);
		const ys = points.map((p) => p.y!);
		// Pre-fix this bottomed out at QUIET (3) — "connections dropped to 0".
		expect(Math.min(...ys)).toBeGreaterThanOrEqual(BUSY);
		expect(Math.max(...ys)).toBeLessThanOrEqual(BUSY + QUIET);
	});

	it('carries the absent node forward rather than inventing bucket times', () => {
		// Same x positions as before the fix: carry-forward fills values inside
		// existing buckets, it never adds new ones.
		const expectedBuckets = [...new Set(rows.map((r) => snap(r.time)))].sort((a, b) => a - b);
		expect(mqttPoints(rows).map((p) => p.x)).toEqual(expectedBuckets);
	});

	it('counts only observed samples, not carried ones', () => {
		// `SeriesPoint.count` drives confidence gating and the tooltip's sample
		// count; a carried value is not a new observation.
		const points = mqttPoints(rows);
		const solo = new Set(soloNodeBuckets(rows));
		for (const p of points) {
			expect(p.count, `bucket ${p.x}`).toBe(solo.has(p.x) ? 1 : 2);
		}
	});
});

describe('connections — bounded staleness horizon', () => {
	const SAMPLES = 40;
	// Quiet node reports for its first five periods, then goes genuinely idle:
	// core stops emitting rows for it entirely once its count hits 0.
	const QUIET_SAMPLES = 5;
	const rows = staggeredCluster(SAMPLES, [...Array(QUIET_SAMPLES).keys()]);
	// Its cadence reads as 90 s, so its last value may be carried for 180 s.
	const horizon = 2 * CADENCE;
	const lastQuietBucket = snap(T0 + PHASE + (QUIET_SAMPLES - 1) * CADENCE);

	it('stops carrying the idle node once its last sample ages past the horizon', () => {
		const points = mqttPoints(rows);
		const stale = points.filter((p) => p.x > lastQuietBucket + horizon);
		expect(stale.length).toBeGreaterThan(0);
		for (const p of stale) {
			expect(p.y, `bucket ${p.x}`).toBe(BUSY);
		}
	});

	it('still bridges the buckets inside the horizon', () => {
		const points = mqttPoints(rows);
		const bridged = points.filter((p) => p.x > T0 && p.x <= lastQuietBucket);
		expect(bridged.length).toBeGreaterThan(0);
		for (const p of bridged) {
			expect(p.y, `bucket ${p.x}`).toBe(BUSY + QUIET);
		}
	});

	it('does not back-fill buckets before the node was ever seen', () => {
		// LOCF only looks backwards. The quiet node's first row is half a cadence
		// after T0, so the first bucket is the busy node alone — legitimately.
		const first = mqttPoints(rows)[0];
		expect(first.x).toBe(T0);
		expect(first.y).toBe(BUSY);
	});
});

describe('connections — cluster-wide gaps stay gaps', () => {
	it('emits no point for a bucket where no node reported', () => {
		// A real outage: neither node emits for 20 minutes. Carry-forward must
		// not paper over it, because it never creates bucket times.
		const rows = [
			connectionRow('busy', T0, BUSY),
			connectionRow('quiet', T0, QUIET),
			connectionRow('busy', T0 + 20 * LATTICE, BUSY),
			connectionRow('quiet', T0 + 20 * LATTICE, QUIET),
		];
		const points = mqttPoints(rows);
		expect(points.map((p) => p.x)).toEqual([T0, T0 + 20 * LATTICE]);
		expect(points.map((p) => p.y)).toEqual([BUSY + QUIET, BUSY + QUIET]);
	});

	it('does not resurrect a node across an outage longer than its horizon', () => {
		// `busy` returns after the outage; `quiet` never does. Its last sample is
		// 20 buckets old, far past 2 × its cadence, so it must not be summed in.
		const rows = [
			connectionRow('busy', T0, BUSY),
			connectionRow('busy', T0 + LATTICE, BUSY),
			connectionRow('quiet', T0, QUIET),
			connectionRow('quiet', T0 + LATTICE, QUIET),
			connectionRow('busy', T0 + 20 * LATTICE, BUSY),
		];
		const points = mqttPoints(rows);
		expect(points.at(-1)!.x).toBe(T0 + 20 * LATTICE);
		expect(points.at(-1)!.y).toBe(BUSY);
	});

	it('carries a node again once it comes back after going stale', () => {
		// Guards the staleness eviction: an aged-out node is dropped from the
		// carry-forward state, so it must be re-registered when it reports again
		// rather than staying permanently excluded.
		//
		// Both nodes need a few closely-spaced samples first so their *own*
		// median gap reads as one bucket. Give `quiet` only two samples either
		// side of the silence and the silence itself becomes its median gap —
		// horizon 2 x 21 buckets — and nothing ever ages out.
		const rows = [
			...[0, 1, 2, 20, 21, 22].map((i) => connectionRow('busy', T0 + i * LATTICE, BUSY)),
			// `quiet` reports at cadence, goes silent well past 2 x that…
			...[0, 1, 2].map((i) => connectionRow('quiet', T0 + i * LATTICE, QUIET)),
			// …then returns, and drops out of the very next bucket again.
			connectionRow('quiet', T0 + 21 * LATTICE, QUIET),
		];
		const byX = new Map(mqttPoints(rows).map((p) => [p.x, p.y]));
		// Fresh.
		expect(byX.get(T0 + 2 * LATTICE)).toBe(BUSY + QUIET);
		// Aged out: busy alone.
		expect(byX.get(T0 + 20 * LATTICE)).toBe(BUSY);
		// Back, and observed.
		expect(byX.get(T0 + 21 * LATTICE)).toBe(BUSY + QUIET);
		// Back, absent from this bucket, but fresh enough to carry again.
		expect(byX.get(T0 + 22 * LATTICE)).toBe(BUSY + QUIET);
	});
});

describe('connections — a sparse node cannot buy an unbounded horizon', () => {
	// kriszyp's #1587 review: two widely separated observations make the median
	// read as a multi-hour "cadence", so uncapped the quiet node's stale count
	// would be summed into every bucket another node supplies for the rest of
	// the window — hiding a real drop to zero. MAX_STALENESS_MS caps it.
	const HOUR = 60 * LATTICE;
	const GAP = 12 * HOUR;
	// `quiet` observed exactly twice, 12 h apart. `busy` reports every minute
	// across the whole window, so every bucket after T0 exists.
	const rows: AnalyticsDataPoint[] = [
		connectionRow('quiet', T0, QUIET),
		connectionRow('quiet', T0 + GAP, QUIET),
	];
	for (let t = 0; t <= GAP + 30 * LATTICE; t += LATTICE) {
		rows.push(connectionRow('busy', T0 + t, BUSY));
	}
	const wideWindow: TimeRange = { startTime: T0 - LATTICE, endTime: T0 + GAP + 60 * LATTICE };
	const byX = new Map(
		runPipeline(connectionsSpec, rows, wideWindow, ['busy', 'quiet'], { snapToPeriod: true })
			.series.find((s) => s.key === 'mqtt')!.points.map((p) => [p.x, p.y]),
	);

	it('still sums both nodes where quiet actually reported', () => {
		expect(byX.get(T0)).toBe(BUSY + QUIET);
		expect(byX.get(T0 + GAP)).toBe(BUSY + QUIET);
	});

	it('drops the sparse node a few minutes after each observation, not 24 h later', () => {
		// 12 h cadence x 2 would have been a 24 h horizon; capped it is 5 min.
		expect(byX.get(T0 + 10 * LATTICE)).toBe(BUSY);
		expect(byX.get(T0 + 60 * LATTICE)).toBe(BUSY);
		expect(byX.get(T0 + GAP + 10 * LATTICE)).toBe(BUSY);
	});

	it('carries it only within the capped horizon', () => {
		// MAX_STALENESS_MS is 5 min, so the bucket one minute later still counts
		// it and the one ten minutes later does not.
		expect(byX.get(T0 + LATTICE)).toBe(BUSY + QUIET);
		expect(byX.get(T0 + GAP + LATTICE)).toBe(BUSY + QUIET);
	});

	it('never leaves a stale carry anywhere in the long tail', () => {
		// The actual regression: no bucket beyond the capped horizon may include
		// the quiet node. Pre-cap, every one of these was BUSY + QUIET.
		const tailStart = T0 + MAX_STALENESS_MS + LATTICE;
		const stale = [...byX.entries()]
			.filter(([x]) => x >= tailStart && x < T0 + GAP)
			.filter(([, y]) => y !== BUSY);
		expect(stale).toEqual([]);
		// …and the tail is actually populated, so this isn't vacuous.
		expect([...byX.keys()].filter((x) => x >= tailStart && x < T0 + GAP).length).toBeGreaterThan(600);
	});
});

describe('connections — node-drop fixture', () => {
	// Uniform 60 s lattice, one node simply missing from the middle bucket —
	// the minimal shape, mirroring table-size's node-drop.json.
	const rows = nodeDrop as unknown as AnalyticsDataPoint[];

	it('holds the cluster total flat across the dropped bucket', () => {
		const out = runPipeline(connectionsSpec, rows, WINDOW, ['n1', 'n2'], { snapToPeriod: true });
		const points = out.series.find((s) => s.key === 'mqtt')!.points;
		expect(points.map((p) => p.x)).toEqual([
			1_700_000_040_000,
			1_700_000_100_000,
			1_700_000_160_000,
			1_700_000_220_000,
		]);
		// Pre-fix the third bucket read 100 (n1 alone) instead of 300.
		expect(points.map((p) => p.y)).toEqual([300, 300, 300, 300]);
	});

	it('per-node mode is untouched — each node keeps its own sparse series', () => {
		// The chip-selector / "stack by node" views read per-node values
		// directly; carry-forward belongs to the cross-node sum only.
		const out = runPipeline(connectionsSpec, rows, WINDOW, ['n1', 'n2'], {
			perNode: true,
			snapToPeriod: true,
		});
		const n2 = out.series.find((s) => s.node === 'n2')!;
		expect(n2.points.length).toBe(3);
		expect(n2.points.map((p) => p.y)).toEqual([200, 200, 200]);
	});
});

describe('database-size — same gauge shape (last/sum)', () => {
	// `last`/`sum` over a stacked area, timestamped by `id`: identical latent
	// bug, called out in #1576 alongside connections.
	// No `time` field at all — Harper serializes this metric's timestamp as `id`,
	// which is why the spec sets `timestamp: 'id'`. AnalyticsDataPoint still
	// declares `time` as required, so the double assertion is load-bearing.
	const row = (node: string, id: number, size: number): AnalyticsDataPoint =>
		({ metric: 'database-size', database: 'data', node, id, size, period: 0 }) as unknown as AnalyticsDataPoint;

	it('holds the replicated total flat when one node misses a bucket', () => {
		const rows = [
			row('n1', T0, 1_000),
			row('n2', T0, 2_000),
			row('n1', T0 + LATTICE, 1_000),
			// n2 absent here
			row('n1', T0 + 2 * LATTICE, 1_000),
			row('n2', T0 + 2 * LATTICE, 2_000),
		];
		const out = runPipeline(databaseSizeSpec, rows, WINDOW, ['n1', 'n2'], { snapToPeriod: true });
		const points = out.series.find((s) => s.key === 'data')!.points;
		expect(points.map((p) => p.y)).toEqual([3_000, 3_000, 3_000]);
	});
});

describe('bytes-sent — additive counters are left alone', () => {
	// sum/sum. A node with no row genuinely contributed no bytes; carrying its
	// previous rate forward would invent traffic.
	const row = (node: string, time: number, bytes: number): AnalyticsDataPoint =>
		({
			metric: 'bytes-sent',
			type: 'egress',
			node,
			time,
			count: 1,
			mean: bytes,
			period: LATTICE,
		}) as AnalyticsDataPoint;

	it('does not carry an absent node into the cross-node sum', () => {
		const rows = [
			row('n1', T0, 60_000),
			row('n2', T0, 60_000),
			row('n1', T0 + LATTICE, 60_000),
			// n2 absent — this bucket must read n1's rate alone.
		];
		const out = runPipeline(bytesSentSpec, rows, WINDOW, ['n1', 'n2'], { snapToPeriod: true });
		const points = out.series.find((s) => s.key === 'egress')!.points;
		// rate = count × mean / period × 1000 = 60_000 / 60_000 × 1000 = 1000 B/s
		expect(points.map((p) => p.y)).toEqual([2_000, 1_000]);
	});
});
