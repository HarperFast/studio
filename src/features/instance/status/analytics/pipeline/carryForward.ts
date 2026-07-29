// Bounded last-observation-carry-forward (LOCF) for cross-node gauge sums.
//
// Why this exists (#1576): Harper emits `mqtt-connections` only when a node's
// count is nonzero (`if (numberOfConnections > 0)` in core's server/mqtt.ts),
// so per-node coverage of a gauge metric is inherently ragged — a node at 0
// emits no row at all. Those rows also carry `period: 0`, so the pipeline
// buckets them onto its `bucket.fallbackMs` lattice (60 s), which the observed
// 90 s emission cadence beats against: two nodes co-land in the same bucket
// only intermittently.
//
// `crossNode: 'sum'` then sums only the nodes *present* in a bucket. A bucket
// holding just the quiet node renders the cluster total as that node's 1–5
// connections instead of ~289 — a one-sample vertical dive that reads as a
// mass disconnect. The tell in the customer's chart was that each dive bottoms
// out at the quiet node's own count, not at 0.
//
// The fix is to carry each absent node's last observation into the sum, but
// only for a bounded time. "No row" is genuinely ambiguous between "this
// node's sample landed in the adjacent bucket" (carry it) and "this node is
// idle at 0" (don't) — unbounded LOCF would overstate a node that has gone
// quiet for real. Prometheus resolves the same ambiguity with a fixed 5-minute
// staleness window; we scale to each node's *observed* cadence instead,
// because Harper's analytics cadence varies per deployment (the instance in
// #1576 had `analytics.aggregatePeriod: 60` configured while rows actually
// landed 90 s apart).
import type { Aggregator } from '../types/analytics';

/** Multiplier on a node's estimated emission interval that bounds how long its
 *  last observation may be carried forward. Two intervals absorbs one missed
 *  emission plus bucket-lattice phase drift, and no more. */
export const STALENESS_INTERVALS = 2;

/**
 * True for gauge-shaped specs — the only shape where a missing per-node row
 * means "unknown" rather than "zero".
 *
 * `crossNode: 'sum'` folds per-node values into a cluster total, and a
 * temporal aggregator of `max`/`last` means each per-node value is a snapshot
 * of a level (active sessions, bytes on disk) rather than an accumulation over
 * the bucket. Summing a subset of snapshots understates the total.
 *
 * Additive counters (`sum`/`sum`, e.g. `mqtt-traffic-*`) must NOT get this
 * treatment: there, a node with no row legitimately contributes zero, and
 * carrying its previous bucket's throughput forward would invent traffic.
 */
export function isGaugeCrossNodeSum(temporal: Aggregator, crossNode: Aggregator): boolean {
	return crossNode === 'sum' && (temporal === 'max' || temporal === 'last');
}

/**
 * Median gap between consecutive observation instants — a robust estimate of
 * how often a node emits. Median rather than mean so that a node which is
 * *often absent* (Harper's `> 0` guard) is still credited with its
 * active-cadence interval instead of an interval inflated by the gaps.
 *
 * `times` need not be sorted, and may contain duplicates (several records at
 * one instant); zero-length gaps are ignored. Returns null when fewer than two
 * distinct instants were observed — callers fall back to the spec's bucket
 * size.
 */
export function estimateEmissionIntervalMs(times: readonly number[]): number | null {
	if (times.length < 2) { return null; }
	const sorted = [...times].sort((a, b) => a - b);
	const gaps: number[] = [];
	for (let i = 1; i < sorted.length; i++) {
		const gap = sorted[i] - sorted[i - 1];
		if (gap > 0) { gaps.push(gap); }
	}
	if (gaps.length === 0) { return null; }
	gaps.sort((a, b) => a - b);
	const mid = gaps.length >> 1;
	return gaps.length % 2 === 1 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

/**
 * Per-node staleness horizon (ms) — how stale a node's last observation may be
 * and still count toward a later bucket's cross-node sum.
 *
 * `floorMs` (the spec's effective bucket size) is a lower bound on the cadence
 * estimate so the horizon always spans at least two buckets: that is what
 * absorbs lattice phase drift when a node's real cadence is *shorter* than the
 * bucket, or when it only ever reported once.
 */
export function buildStalenessHorizons(
	observationTimesByNode: ReadonlyMap<string, number[]>,
	floorMs: number,
): Map<string, number> {
	const horizons = new Map<string, number>();
	for (const [node, times] of observationTimesByNode) {
		const cadence = estimateEmissionIntervalMs(times) ?? 0;
		horizons.set(node, STALENESS_INTERVALS * Math.max(cadence, floorMs));
	}
	return horizons;
}
