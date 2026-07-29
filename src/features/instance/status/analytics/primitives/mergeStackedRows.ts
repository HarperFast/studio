// Row builder for StackedAreaChart: merges every series onto the union of x
// positions, forward-filling each across the positions it did not report —
// bounded by the same staleness horizon the pipeline applies to cross-node
// gauge sums (#1576, pipeline/carryForward.ts).
//
// Why a fill is needed at all: Harper emits per-node analytics records at
// staggered instants, and gauge rows carry `period: 0`, so the pipeline snaps
// them onto the spec's `bucket.fallbackMs` lattice — a 90 s cadence on a 60 s
// lattice lands on some buckets and skips others. A strict equality merge then
// yields rows with one populated cell and N-1 nulls, which a stacked area
// renders as a shredded, mostly-empty stack.
//
// The fill is most load-bearing in "Stack by: Node" mode. There the renderer
// remaps the spec's dimension to 'node', so a series' buckets are exactly the
// instants that one node reported and that node is present in every one of
// them: the pipeline's own carry-forward (which never invents bucket times) is a
// structural no-op, and this merge is the only thing holding the bands together.
// In "Stack by: Type" mode the cross-node fold has already put every type on the
// shared lattice, so the fill only bridges types that genuinely report at
// different cadences.
//
// Why it has to be bounded: unbounded LOCF carries a band for the rest of the
// window, so a node that has genuinely gone idle keeps contributing its last
// value to the stacked total forever. That is exactly the #1576 overstatement,
// one layer up — core emits `mqtt-connections` only while the count is nonzero
// (`if (numberOfConnections > 0)` in server/mqtt.ts), so "no row" is what an
// idle node looks like.
//
// Past the horizon a band fills 0, not null:
//   - It mirrors the pipeline. Dropping an expired node from a `crossNode: 'sum'`
//     *is* contributing 0 to that sum.
//   - It is what a stacked chart means. Bands add, so 0 is the neutral element;
//     a null punches a hole through the stack and drops every band above it.
//   - It is right for the additive counters too (`mqtt-traffic-*`,
//     bytes-sent/received): no row for a rate series means no traffic, so 0 is
//     the honest value — strictly better than carrying the last throughput on
//     forever.
// A cluster-wide gap cannot turn into spurious zeros, because the x positions
// come only from series that actually reported: if everything stops, the rows
// stop too.
import { estimateEmissionIntervalMs, STALENESS_INTERVALS } from '../pipeline/carryForward';
import type { SeriesData } from '../types/analytics';

/** Recharts `dataKey` for the optional ceiling / reference line. Distinct from
 *  any series key, which is a dimension value or a `dim|node` composite. */
export const CEILING_KEY = '__ceiling__';

/** One Recharts datum: `x` plus one entry per series key (and the ceiling). */
export type StackedRow = Record<string, number | null>;

/** Last reading a series produced, and the x position it produced it at. */
interface LastReading {
	at: number;
	y: number | null;
}

export function mergeStackedRows(data: SeriesData): StackedRow[] {
	const xs = new Set<number>();
	for (const s of data.series) { for (const p of s.points) { xs.add(p.x); } }
	if (data.ceiling) { for (const p of data.ceiling.points) { xs.add(p.x); } }
	const sortedXs = [...xs].sort((a, b) => a - b);

	// Pre-build x → y lookup per series for O(1) access during the fill.
	const pointMaps = data.series.map((s) => {
		const m = new Map<number, number | null>();
		for (const p of s.points) { m.set(p.x, p.y); }
		return m;
	});
	const horizons = buildHorizons(data, sortedXs);
	const ceilingMap = data.ceiling
		? new Map<number, number | null>(data.ceiling.points.map((p) => [p.x, p.y]))
		: null;

	const last: (LastReading | null)[] = data.series.map(() => null);
	let lastCeiling: number | null = null;

	return sortedXs.map((x) => {
		const row: StackedRow = { x };
		data.series.forEach((s, i) => {
			// `undefined` is "no point here"; a point whose y is null reported
			// without a value, and must not be confused with the former.
			const observed = pointMaps[i].get(x);
			if (observed !== undefined) { last[i] = { at: x, y: observed }; }
			row[s.key] = fillAt(last[i], x, horizons[i]);
		});
		if (ceilingMap) {
			// The ceiling is a reference line drawn over the stack, not a band in
			// it: it adds to no total and has no zero to expire to (a ceiling that
			// drops to 0 reads as a limit of nothing). Carried unbounded, as before.
			const observed = ceilingMap.get(x);
			if (observed !== undefined) { lastCeiling = observed; }
			row[CEILING_KEY] = lastCeiling;
		}
		return row;
	});
}

/** What a series contributes at `x`: its own reading where it reported, its most
 *  recent one while that is still inside the horizon, 0 once it is not. `null`
 *  before the series' first point — there is nothing to carry, and LOCF never
 *  back-fills — and for a point that reported no value. */
function fillAt(last: LastReading | null, x: number, horizonMs: number): number | null {
	if (last === null || last.y === null) { return null; }
	return x - last.at > horizonMs ? 0 : last.y;
}

/**
 * Per-series staleness horizon (ms), mirroring the pipeline's
 * `buildStalenessHorizons`: `STALENESS_INTERVALS` × the series' own median
 * reporting gap, floored at the rendered lattice step so a horizon always spans
 * at least two x positions (that floor is what covers a series reporting faster
 * than the lattice, or having reported only once).
 *
 * Plus one lattice step of slack, which the pipeline does not need. The pipeline
 * estimates cadence from raw emission instants; by the time a series reaches a
 * primitive those have been snapped onto the lattice, and snapping *compresses*
 * alternate gaps — a 90 s cadence on a 60 s lattice reports at 0/120/180/300…,
 * so its gaps alternate 120/60 and their median reads 60 or 90 depending on how
 * many samples the window caught, while the widest gap is 120. Absent the slack,
 * a series could expire on the very beat pattern the snap induced. One step is
 * the most the snap can stretch a gap by, so adding it keeps this horizon at
 * least as generous as the pipeline's — the safe direction, since expiring a
 * series that is merely out of phase is the artifact we are trying not to draw.
 */
function buildHorizons(data: SeriesData, sortedXs: readonly number[]): number[] {
	const latticeMs = estimateEmissionIntervalMs(sortedXs) ?? 0;
	return data.series.map((s) => {
		const cadenceMs = estimateEmissionIntervalMs(s.points.map((p) => p.x)) ?? 0;
		return STALENESS_INTERVALS * Math.max(cadenceMs, latticeMs) + latticeMs;
	});
}
