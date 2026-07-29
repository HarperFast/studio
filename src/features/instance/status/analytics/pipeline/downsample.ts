// Post-aggregation downsampling: fold a series' points onto the window's
// target bucket lattice.
//
// Why this is a *post* pass rather than a coarser snap in `snapToBucketTime`
// (#1576 follow-up): the pipeline's per-record bucketing assumes roughly one
// record per (node, bucket) and folds anything more with the spec's temporal
// aggregator. Widening that lattice therefore changes what the temporal
// aggregator sees, and for a `rate`-transformed field with `temporal: 'sum'`
// (bytes-sent/received, mqtt-traffic-*, fsWrite) it sums per-second rates that
// belong to *different* time periods — measured 1000 B/s becoming 3000 B/s on a
// 5 min lattice, and it would have been 60x at 30 d.
//
// Downsampling after the fact leaves every existing aggregation path — temporal,
// cross-node, and the bounded carry-forward from #1576 — operating on exactly
// the buckets it does today, and only reduces what the primitives have to draw.
import type { Aggregator, FieldSpec, MetricSpec, Series, SeriesData, SeriesPoint, Transform } from '../types/analytics';
import { aggregate } from './aggregators';

/** True when a field's value has already been divided by its period, i.e. it is
 *  an *intensive* per-second quantity. Such values must never be re-summed
 *  across time — two consecutive 1000 B/s samples are 1000 B/s, not 2000. */
export function isRateTransform(transform: Transform | undefined): boolean {
	if (!transform) { return false; }
	if (transform.kind === 'rate') { return true; }
	if (transform.kind === 'compose') { return transform.steps.some(isRateTransform); }
	return false;
}

/**
 * How to fold several fine-grained points into one coarse bucket.
 *
 * The guiding rule is "aggregate over time the same way the spec already
 * does", with two corrections:
 *
 * - **rate fields** collapse with `mean`, never `sum` (see `isRateTransform`).
 *   Equal-weighted because Harper emits one row per node per period at a fixed
 *   cadence, so every point in a coarse bucket covers the same span.
 * - **percentiles** collapse with `max`. A p95-of-p95s is not a p95, and of the
 *   two defensible approximations an operator wants the one that keeps spikes
 *   visible rather than smoothing them away at 7 d / 30 d.
 *
 * `count-weighted-mean` stays count-weighted — `SeriesPoint.count` carries the
 * per-bucket observation total, so the weighting survives the fold.
 */
export function downsampleAggregator(temporal: Aggregator, transform: Transform | undefined): Aggregator {
	if (isRateTransform(transform)) { return 'mean'; }
	switch (temporal) {
		case 'p50':
		case 'p95':
		case 'p99':
			return 'max';
		default:
			return temporal;
	}
}

/** Fold `points` onto a `targetMs` lattice, round-to-nearest so coarse bucket
 *  times stay on the same epoch-aligned grid the fine snap uses. */
export function downsamplePoints(points: SeriesPoint[], targetMs: number, agg: Aggregator): SeriesPoint[] {
	if (targetMs <= 0 || points.length === 0) { return points; }
	const byBucket = new Map<number, { items: { value: number | null; count?: number }[]; count: number }>();
	let shifted = false;
	for (const p of points) {
		const bucket = Math.round(p.x / targetMs) * targetMs;
		// A point can land in a bucket of its own and *still* need moving —
		// see the early-return note below.
		if (bucket !== p.x) { shifted = true; }
		let entry = byBucket.get(bucket);
		if (!entry) {
			entry = { items: [], count: 0 };
			byBucket.set(bucket, entry);
		}
		entry.items.push({ value: p.y, count: p.count });
		// Sum observation counts so confidence gating still sees the real total.
		entry.count += p.count ?? 0;
	}
	// Nothing to gain (and a needless copy) when every point already sits ON its
	// own coarse bucket boundary — the common case for the 1 h preset, whose
	// target equals the snap lattice.
	//
	// `byBucket.size === points.length` alone is NOT sufficient: points can map
	// one-to-one onto buckets while every one of them still moves. Records
	// carrying a real 90 s `period` snap onto a 90 s lattice, and folding that
	// onto the 1 h preset's 60 s target sends k*90 000 to round(1.5k)*60 000 —
	// 0, 120 000, 180 000, 300 000 … all distinct, none equal to their input.
	// Returning the input there would leave the series off the target grid and
	// break the StorageTab trend's `syncMethod="value"` crosshair match (#1514).
	// Reachable as soon as core stops stamping `period: 0`
	// (HarperFast/harper#1997), which is exactly what we asked it to do.
	if (!shifted && byBucket.size === points.length) { return points; }
	const out: SeriesPoint[] = [];
	for (const bucket of [...byBucket.keys()].sort((a, b) => a - b)) {
		const { items, count } = byBucket.get(bucket)!;
		// `aggregate` returns null when every value is null, which preserves an
		// explicit gap rather than dropping the bucket entirely.
		out.push({ x: bucket, y: aggregate(agg, items), ...(count > 0 ? { count } : {}) });
	}
	return out;
}

/** Resolve the temporal aggregator + transform a series was built from, so the
 *  fold matches the spec. Series are keyed by `dim`; for field-mode specs `dim`
 *  is the field key, for groupBy every series shares the one field. */
function fieldFor(spec: MetricSpec, series: Series): FieldSpec | undefined {
	if (spec.series.kind === 'groupBy') { return spec.series.field; }
	return spec.series.fields.find((f) => (typeof f.field === 'string' ? f.field : f.label) === series.dim)
		?? spec.series.fields[0];
}

/** Fold every series (and the ceiling) in a result, choosing the aggregator
 *  per series via `aggFor`. */
function foldSeriesData(data: SeriesData, targetMs: number, aggFor: (s: Series) => Aggregator): SeriesData {
	if (targetMs <= 0) { return data; }
	const fold = (s: Series): Series => ({ ...s, points: downsamplePoints(s.points, targetMs, aggFor(s)) });
	return {
		...data,
		series: data.series.map(fold),
		...(data.ceiling ? { ceiling: fold(data.ceiling) } : {}),
	};
}

/** Downsample a spec-driven pipeline result, matching each series' own field. */
export function downsampleSeriesData(data: SeriesData, spec: MetricSpec, targetMs: number): SeriesData {
	return foldSeriesData(data, targetMs, (s) => {
		const field = fieldFor(spec, s);
		const temporal = field?.aggregator?.temporal ?? spec.aggregator.temporal;
		return downsampleAggregator(temporal, field?.transform);
	});
}

/**
 * Downsample a derived metric's hand-built SeriesData.
 *
 * `error-rate`, `request-rate` and `transaction-log-growth` assemble series
 * from raw columns instead of going through `runPipeline`, so they never see
 * the spec-driven path above. They are all intensive quantities (a ratio and
 * two per-second rates), hence the `'mean'` default; a derived metric that
 * measures something extensive sets `downsampleAggregator` on its spec.
 *
 * Idempotent: folding points that already sit on `targetMs` leaves them
 * untouched, so applying this to a recompute that internally opted into
 * `downsampleToWindow` (mqtt-traffic) is a no-op rather than a double average.
 */
export function downsampleDerivedSeriesData(
	data: SeriesData,
	targetMs: number,
	agg: Aggregator = 'mean',
): SeriesData {
	return foldSeriesData(data, targetMs, () => agg);
}
