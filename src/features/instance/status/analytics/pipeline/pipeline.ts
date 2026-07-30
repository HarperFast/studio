// Generic spec pipeline. Both groupBy and field modes emit one SeriesPoint
// per unique `record.time` per series (per-time bucketing landed in Step 3
// for groupBy; Step 4 for field).
//
// Step 4.5 adds two-pass cross-node aggregation. Within each (dimensionValue,
// time) bucket (groupBy) or each `time` bucket (field), records are
// partitioned by `node`. The temporal aggregator runs per `(time, node)`
// (inner pass), producing one (value, count) per node. Then the crossNode
// aggregator runs across nodes within `(dim, time)` (outer pass) to yield
// the final value. The per-node `count` is threaded through to the outer
// pass's AggInput[] so count-weighted-mean stays well-defined when the
// crossNode aggregator needs it.
//
// Gauge-shaped specs (`crossNode: 'sum'` over `max`/`last` per-node
// snapshots — `connections`, `database-size`) additionally get bounded
// last-observation-carry-forward between the two passes: a node absent from a
// bucket contributes its most recent value for up to ~2 of its own emission
// intervals. Harper omits a gauge row entirely when the value is 0, so absence
// is not zero — see carryForward.ts for the full rationale (#1576).
//
// Known limitation — count-weighted-mean across nodes: the inner pass
// invokes the temporal aggregator with values that share the per-node
// bucket's totalCount as their weight. When a single (node, time) bucket
// holds multiple records, the inner result is still correct (CWM uses each
// record's own count internally), but the *weight* attached to each
// per-node AggInput passed into the outer pass is the sum of all record
// counts in that node-bucket — i.e., the outer pass weights nodes by total
// observations, not by the inner-mean's effective sample size. For the
// shipped specs this is fine: replication-latency does not flow through
// this pipeline, mqtt-traffic-* is sum/sum (associative). Revisit if a CWM
// crossNode spec lands.
import type {
	Aggregator,
	AnalyticsDataPoint,
	FieldSpec,
	MetricSpec,
	Series,
	SeriesData,
	SeriesPoint,
	TimeRange,
} from '../types/analytics';
import { type AggInput, aggregate } from './aggregators';
import { labelWithApprox } from './approxLabel';
import { buildStalenessHorizons, isGaugeCrossNodeSum } from './carryForward';
import { classifyConfidence } from './confidence';
import { evalFieldExpr } from './fieldExpr';
import { runTransform } from './runTransform';

export interface RunPipelineOptions {
	/** When true, runGroupBy emits one Series per (dim, node) instead of
	 *  collapsing nodes via the crossNode aggregator. Each series carries
	 *  structured `dim`/`node` fields so consumers (e.g.
	 *  DimensionSelectorRenderer) can filter by selected dim while keeping
	 *  per-node detail. No-op for
	 *  `kind: 'field'` series sources or for the OTHER bucket.
	 *  Used by chip-selector panels (duration, success, transfer, db-*,
	 *  connection, response_200) so the operator can spot a hot node
	 *  instead of reading a cluster-mean line. */
	perNode?: boolean;
	/** When true, each record's resolved time is snapped to its period
	 *  boundary (`floor(time/period)*period`). Harper emits per-node
	 *  records at slightly offset instants within the same minute; without
	 *  this snap, downstream stacks/lines render with sparse staggered
	 *  rows that look jagged. MetricRenderer enables this for production
	 *  rendering; pipeline tests that use synthetic small-integer times
	 *  leave it off so they keep their distinct buckets. */
	snapToPeriod?: boolean;
}

/** Composite string key for a per-node series — React key / recharts name
 *  only. Never split it back apart: a dimension value containing '|' (URL
 *  paths can) makes the string ambiguous. Consumers read the structured
 *  `Series.dim` / `Series.node` fields instead. */
export function makeSeriesKey(dim: string, node: string): string {
	return `${dim}|${node}`;
}

export function runPipeline(
	spec: MetricSpec,
	records: AnalyticsDataPoint[],
	_window: TimeRange,
	_nodes: string[],
	options?: RunPipelineOptions,
): SeriesData {
	if (spec.series.kind === 'field') {
		return runFieldSpecs(spec, spec.series.fields, records, options?.perNode ?? false, options?.snapToPeriod ?? false);
	}
	return runGroupBy(spec, spec.series, records, options?.perNode ?? false, options?.snapToPeriod ?? false);
}

/** Snap a record's time to its period boundary so per-node staggering
 *  doesn't leak into downstream visuals. Round-to-nearest (not floor) so
 *  records arriving a few seconds before the boundary still group with
 *  their siblings on the *other* side — Math.floor produced zigzag
 *  aggregates because nodes reporting at e.g. 1:59:43, 2:00:03, 2:00:16
 *  would split across two buckets. */
function snapToBucketTime(spec: MetricSpec, record: AnalyticsDataPoint, time: number): number {
	const period = resolvePeriod(spec, record);
	return Math.round(time / period) * period;
}

/** Effective period (ms) for a record: `record.period` when it is a positive
 *  finite number, else `spec.bucket.fallbackMs ?? 60_000`. Present-but-invalid
 *  values (0, negative, NaN) get the same fallback as a missing field — a
 *  Harper build omitting or zeroing `period` should degrade to the spec's
 *  bucket size (rate transforms compute against it), not silently drop the
 *  record. */
function resolvePeriod(spec: MetricSpec, record: AnalyticsDataPoint): number {
	const p = record.period;
	if (typeof p === 'number' && Number.isFinite(p) && p > 0) { return p; }
	return fallbackPeriod(spec);
}

/** The spec's declared bucket size, sanitized. A misconfigured non-positive
 *  `fallbackMs` gets the same treatment as a bad record period — rates must
 *  never divide by zero or flip sign. */
function fallbackPeriod(spec: MetricSpec): number {
	const fallback = spec.bucket?.fallbackMs;
	return typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0 ? fallback : 60_000;
}

/** Resolve the timestamp on a record per `spec.timestamp`. Defaults to 'time'.
 *  Records like database-size / storage-volume carry `id` (ms since epoch)
 *  instead of `time`; `timestamp: 'id'` reads `id`; `'time-or-id'` falls back. */
function resolveTime(spec: MetricSpec, record: AnalyticsDataPoint): number | null {
	const which = spec.timestamp ?? 'time';
	if (which === 'time') {
		const t = record.time;
		return typeof t === 'number' && Number.isFinite(t) ? t : null;
	}
	if (which === 'id') {
		const t = record.id;
		return typeof t === 'number' && Number.isFinite(t) ? t : null;
	}
	// 'time-or-id'
	const t = record.time;
	if (typeof t === 'number' && Number.isFinite(t)) { return t; }
	const id = record.id;
	return typeof id === 'number' && Number.isFinite(id) ? id : null;
}

/** Resolve every record's timestamp up front (`resolveTime` per record).
 *  Records that resolve to null are dropped by the callers; emit ONE summary
 *  warn with a count and a sample instead of one warn per unique (dim, time)
 *  — the old per-key dedup Set grew unboundedly on long windows. */
function resolveTimes(where: string, spec: MetricSpec, records: AnalyticsDataPoint[]): (number | null)[] {
	let dropped = 0;
	let sample: AnalyticsDataPoint | undefined;
	const resolved = records.map((r) => {
		const time = resolveTime(spec, r);
		if (time === null) {
			dropped++;
			sample ??= r;
		}
		return time;
	});
	if (dropped > 0) {
		console.warn(`[${where}] Dropping ${dropped} record(s) with no resolvable timestamp:`, {
			sample: sample && { time: sample.time, id: sample.id, node: sample.node },
			timestamp: spec.timestamp ?? 'time',
		});
	}
	return resolved;
}

function projectValue(
	spec: MetricSpec,
	fieldSpec: FieldSpec,
	record: AnalyticsDataPoint,
): number | null {
	const raw = typeof fieldSpec.field === 'string'
		? (typeof record[fieldSpec.field] === 'number' ? (record[fieldSpec.field] as number) : null)
		: evalFieldExpr(fieldSpec.field, record);
	return runTransform(fieldSpec.transform ?? { kind: 'raw' }, raw, resolvePeriod(spec, record));
}

interface NodeBucket {
	items: AggInput[]; // per-record {value, count} for this (dim?, time, node)
	totalCount: number; // Σ of record counts within this node-bucket
}

function runGroupBy(
	spec: MetricSpec,
	src: Extract<MetricSpec['series'], { kind: 'groupBy' }>,
	records: AnalyticsDataPoint[],
	perNode: boolean,
	snapToPeriod: boolean,
): SeriesData {
	const tempAgg: Aggregator = src.field.aggregator?.temporal ?? spec.aggregator.temporal;
	const crossAgg: Aggregator = src.field.aggregator?.crossNode ?? spec.aggregator.crossNode;
	const isApprox = tempAgg === 'count-weighted-mean' || crossAgg === 'count-weighted-mean';
	// When the spec already groups by node, perNode is redundant — emitting
	// one series per (node, node) would duplicate. Fall through to the
	// cluster-aggregate path which, for dimension='node', is naturally
	// one-series-per-node.
	const dimensionIsNode = src.dimension === 'node';
	// Bounded per-node carry-forward only earns its keep on the cluster-aggregate
	// path AND only when a bucket can actually hold more than one node — i.e. a
	// non-node dimension. When the dimension IS node, each dim's buckets contain
	// exactly that one node (dimVal and the row's node are the same field), so
	// the crossNode sum is identity and there is never an absent node to fill;
	// the observation bookkeeping + horizon build would be pure overhead. That
	// rules out both node-dimension combos: the "Stack by: Node" remap
	// (!perNode) and the redundant perNode+node case. Gauge-shaped specs only
	// (see carryForward.ts).
	const carryForward = !perNode && !dimensionIsNode && isGaugeCrossNodeSum(tempAgg, crossAgg);

	// Step 4.5 structure: dim → time → node → NodeBucket. Per-dimension totals
	// are accumulated separately for topN ranking + per-series confidence
	// gating.
	const buckets = new Map<string | number, Map<number, Map<string, NodeBucket>>>();
	const dimTotals = new Map<string | number, number>();
	// dim → node → raw (pre-snap) observation instants. Only collected for
	// gauge specs, which are the only consumers — the cadence estimate must see
	// the true emission instants, not the snapped lattice they land on.
	const observationTimes = carryForward ? new Map<string | number, Map<string, number[]>>() : null;
	const resolvedTimes = resolveTimes('runGroupBy', spec, records);
	for (let i = 0; i < records.length; i++) {
		const r = records[i];
		const dimVal = r[src.dimension];
		if (typeof dimVal !== 'string' && typeof dimVal !== 'number') { continue; }
		const v = projectValue(spec, src.field, r);
		if (v === null) { continue; }
		const resolvedTime = resolvedTimes[i];
		if (resolvedTime === null) { continue; }
		const time = snapToPeriod ? snapToBucketTime(spec, r, resolvedTime) : resolvedTime;
		const recordCount = typeof r.count === 'number' && Number.isFinite(r.count) ? r.count : 1;
		const node = typeof r.node === 'string' ? r.node : '_no_node';

		dimTotals.set(dimVal, (dimTotals.get(dimVal) ?? 0) + recordCount);

		let perTime = buckets.get(dimVal);
		if (!perTime) {
			perTime = new Map();
			buckets.set(dimVal, perTime);
		}
		let perNodeBucket = perTime.get(time);
		if (!perNodeBucket) {
			perNodeBucket = new Map();
			perTime.set(time, perNodeBucket);
		}
		let nodeBucket = perNodeBucket.get(node);
		if (!nodeBucket) {
			nodeBucket = { items: [], totalCount: 0 };
			perNodeBucket.set(node, nodeBucket);
		}
		nodeBucket.items.push({ value: v, count: recordCount });
		nodeBucket.totalCount += recordCount;
		if (observationTimes) { recordObservation(observationTimes, dimVal, node, resolvedTime); }
	}

	// Apply topN + otherBucket: rank dimensions by totalCount descending, keep
	// the top N, roll the rest into an `Other` aggregate if otherBucket is on.
	const ranked = [...dimTotals.entries()].sort((a, b) => b[1] - a[1]);
	const topN = src.topN ?? Infinity;
	const kept = ranked.slice(0, topN);
	const rest = ranked.slice(topN);

	const series: Series[] = [];
	let suppressedSeriesCount = 0;
	for (const [key, total] of kept) {
		const confClass = classifyConfidence(total, spec.confidence);
		if (confClass === 'suppress') {
			suppressedSeriesCount++;
			continue;
		}
		const perTime = buckets.get(key);
		if (!perTime) { continue; }
		if (perNode && !dimensionIsNode) {
			// Emit one Series per (dim, node). Skip the crossNode pass; each
			// node's points come from the inner temporal aggregation alone.
			// Renderers filter/color via the structured dim/node fields; the
			// composite key only keeps React/recharts ids unique.
			const nodeBuckets = new Map<string, Map<number, NodeBucket>>();
			for (const [time, byNode] of perTime) {
				for (const [node, nb] of byNode) {
					let perTimeForNode = nodeBuckets.get(node);
					if (!perTimeForNode) {
						perTimeForNode = new Map();
						nodeBuckets.set(node, perTimeForNode);
					}
					perTimeForNode.set(time, nb);
				}
			}
			for (const [node, perTimeForNode] of nodeBuckets) {
				const points: SeriesPoint[] = [];
				const sortedTimes = [...perTimeForNode.keys()].sort((a, b) => a - b);
				for (const time of sortedTimes) {
					const nb = perTimeForNode.get(time)!;
					const y = aggregate(tempAgg, nb.items);
					points.push({ x: time, y, count: nb.totalCount });
				}
				series.push({
					key: makeSeriesKey(String(key), node),
					label: labelWithApprox(node, tempAgg),
					dim: String(key),
					node,
					points,
					approx: isApprox,
				});
			}
		} else {
			// Cluster-aggregate path (default). Two-pass: temporal-per-node,
			// then crossNode across nodes within each time bucket.
			const points = aggregateOverTime(
				tempAgg,
				crossAgg,
				perTime,
				observationTimes && buildStalenessHorizons(observationTimes.get(key) ?? new Map(), fallbackPeriod(spec)),
			);
			series.push({
				key: String(key),
				label: labelWithApprox(String(key), tempAgg),
				dim: String(key),
				// For groupBy-'node' specs each dimension value IS a node id —
				// surface it so node legends need no key heuristics.
				...(dimensionIsNode ? { node: String(key) } : {}),
				points,
				approx: isApprox,
			});
		}
	}

	// OTHER bucket: if enabled and there are more buckets beyond topN, aggregate
	// them into one. Bucket per-(time, node) across all "rest" dimension values,
	// then run the same two-pass aggregation.
	if (src.otherBucket && rest.length > 0) {
		const otherTotal = rest.reduce((acc, [, c]) => acc + c, 0);
		const confClass = classifyConfidence(otherTotal, spec.confidence);
		if (confClass !== 'suppress') {
			const otherPerTime = new Map<number, Map<string, NodeBucket>>();
			// Merged per-node observation instants across every rolled-up dim, so
			// the Other band's carry-forward horizon reflects the same cadence its
			// members were emitted at.
			const otherObservationTimes = observationTimes ? new Map<string, number[]>() : null;
			for (const [key] of rest) {
				const dimObservationTimes = observationTimes?.get(key);
				if (otherObservationTimes && dimObservationTimes) {
					for (const [node, times] of dimObservationTimes) {
						let merged = otherObservationTimes.get(node);
						if (!merged) {
							merged = [];
							otherObservationTimes.set(node, merged);
						}
						// Append by loop, not spread — argument-spread blows the V8
						// stack past ~125k elements and a long window can hold more.
						for (const t of times) { merged.push(t); }
					}
				}
				const perTime = buckets.get(key);
				if (!perTime) { continue; }
				for (const [time, perNodeBucket] of perTime) {
					let mergedPerNode = otherPerTime.get(time);
					if (!mergedPerNode) {
						mergedPerNode = new Map();
						otherPerTime.set(time, mergedPerNode);
					}
					for (const [node, nb] of perNodeBucket) {
						let merged = mergedPerNode.get(node);
						if (!merged) {
							merged = { items: [], totalCount: 0 };
							mergedPerNode.set(node, merged);
						}
						for (const item of nb.items) { merged.items.push(item); }
						merged.totalCount += nb.totalCount;
					}
				}
			}
			const otherPoints = aggregateOverTime(
				tempAgg,
				crossAgg,
				otherPerTime,
				otherObservationTimes && buildStalenessHorizons(otherObservationTimes, fallbackPeriod(spec)),
			);
			series.push({
				key: 'Other',
				label: labelWithApprox('Other', tempAgg),
				dim: 'Other',
				points: otherPoints,
				approx: isApprox,
			});
		} else {
			suppressedSeriesCount++;
		}
	}

	return {
		series,
		thresholds: spec.thresholds,
		...(suppressedSeriesCount > 0 ? { suppressedSeriesCount } : {}),
	};
}

function runFieldSpecs(
	spec: MetricSpec,
	fields: FieldSpec[],
	records: AnalyticsDataPoint[],
	perNode: boolean,
	snapToPeriod: boolean,
): SeriesData {
	// Timestamps don't depend on the field — resolve (and summary-warn) once,
	// not once per field.
	const resolvedTimes = resolveTimes('runFieldSpecs', spec, records);
	const seriesArrays: Series[][] = fields.map((f) => {
		const tempAgg = f.aggregator?.temporal ?? spec.aggregator.temporal;
		const crossAgg = f.aggregator?.crossNode ?? spec.aggregator.crossNode;
		const isApprox = tempAgg === 'count-weighted-mean' || crossAgg === 'count-weighted-mean';
		const fieldKey = typeof f.field === 'string' ? f.field : f.label;
		const carryForward = !perNode && isGaugeCrossNodeSum(tempAgg, crossAgg);

		// time → node → NodeBucket
		const buckets = new Map<number, Map<string, NodeBucket>>();
		// node → raw (pre-snap) observation instants; see runGroupBy.
		const observationTimes = carryForward ? new Map<string, number[]>() : null;
		for (let i = 0; i < records.length; i++) {
			const r = records[i];
			const resolvedTime = resolvedTimes[i];
			if (resolvedTime === null) { continue; }
			const v = projectValue(spec, f, r);
			if (v === null) { continue; }
			const recordCount = typeof r.count === 'number' && Number.isFinite(r.count) ? r.count : 1;
			const node = typeof r.node === 'string' ? r.node : '_no_node';
			const time = snapToPeriod ? snapToBucketTime(spec, r, resolvedTime) : resolvedTime;
			let byNode = buckets.get(time);
			if (!byNode) {
				byNode = new Map();
				buckets.set(time, byNode);
			}
			let nodeBucket = byNode.get(node);
			if (!nodeBucket) {
				nodeBucket = { items: [], totalCount: 0 };
				byNode.set(node, nodeBucket);
			}
			nodeBucket.items.push({ value: v, count: recordCount });
			nodeBucket.totalCount += recordCount;
			if (observationTimes) {
				const times = observationTimes.get(node);
				if (times) { times.push(resolvedTime); }
				else { observationTimes.set(node, [resolvedTime]); }
			}
		}

		if (perNode) {
			// Emit one Series per (field, node) — both axes carried on the
			// structured dim/node fields; label is `${fieldLabel} — ${node}`
			// so legends stay readable.
			const nodeBuckets = new Map<string, Map<number, NodeBucket>>();
			for (const [time, byNode] of buckets) {
				for (const [node, nb] of byNode) {
					let perTimeForNode = nodeBuckets.get(node);
					if (!perTimeForNode) {
						perTimeForNode = new Map();
						nodeBuckets.set(node, perTimeForNode);
					}
					perTimeForNode.set(time, nb);
				}
			}
			const out: Series[] = [];
			for (const [node, perTimeForNode] of nodeBuckets) {
				const points: SeriesPoint[] = [];
				const sortedTimes = [...perTimeForNode.keys()].sort((a, b) => a - b);
				for (const time of sortedTimes) {
					const nb = perTimeForNode.get(time)!;
					const y = aggregate(tempAgg, nb.items);
					points.push({ x: time, y, count: nb.totalCount });
				}
				out.push({
					key: makeSeriesKey(fieldKey, node),
					label: labelWithApprox(`${f.label} — ${node}`, tempAgg),
					dim: fieldKey,
					node,
					axis: f.axis,
					points,
					approx: isApprox,
				});
			}
			return out;
		}

		// Cluster-aggregate path.
		const points = aggregateOverTime(
			tempAgg,
			crossAgg,
			buckets,
			observationTimes && buildStalenessHorizons(observationTimes, fallbackPeriod(spec)),
		);
		return [{
			key: fieldKey,
			label: labelWithApprox(f.label, tempAgg),
			dim: fieldKey,
			axis: f.axis,
			points,
			approx: isApprox,
		}];
	});
	return { series: seriesArrays.flat(), thresholds: spec.thresholds };
}

/** Append one raw observation instant under (dim, node). */
function recordObservation(
	observationTimes: Map<string | number, Map<string, number[]>>,
	dimVal: string | number,
	node: string,
	time: number,
): void {
	let byNode = observationTimes.get(dimVal);
	if (!byNode) {
		byNode = new Map();
		observationTimes.set(dimVal, byNode);
	}
	const times = byNode.get(node);
	if (times) { times.push(time); }
	else { byNode.set(node, [time]); }
}

/**
 * Walk a series' time buckets in ascending order, folding each with the
 * two-pass aggregation.
 *
 * `horizonByNode` opts the series into bounded per-node carry-forward — set
 * only for gauge-shaped specs (`crossNode: 'sum'` over `max`/`last` per-node
 * snapshots; see carryForward.ts). A node absent from a bucket then
 * contributes its last observed value instead of nothing, provided that
 * observation is no older than the node's staleness horizon. Without it, a
 * bucket that happens to hold only one node of a cluster renders as that
 * node's value alone — the ~0 dive in #1576.
 *
 * Carry-forward never invents bucket times: a bucket with no node reporting
 * stays absent, so the series keeps its original x positions and a genuine
 * cluster-wide gap still reads as a gap.
 */
function aggregateOverTime(
	temporal: Aggregator,
	crossNode: Aggregator,
	perTime: Map<number, Map<string, NodeBucket>>,
	horizonByNode: Map<string, number> | null,
): SeriesPoint[] {
	const sortedTimes = [...perTime.keys()].sort((a, b) => a - b);
	const points: SeriesPoint[] = [];
	if (!horizonByNode) {
		for (const time of sortedTimes) {
			const { y, count } = aggregateTwoPass(temporal, crossNode, perTime.get(time)!);
			points.push({ x: time, y, count });
		}
		return points;
	}
	const lastObserved = new Map<string, { time: number; value: number }>();
	for (const time of sortedTimes) {
		const byNode = perTime.get(time)!;
		const inputs: AggInput[] = [];
		const observed = new Set<string>();
		let count = 0;
		for (const [node, nodeBucket] of byNode) {
			count += nodeBucket.totalCount;
			const nodeY = aggregate(temporal, nodeBucket.items);
			if (typeof nodeY !== 'number' || !Number.isFinite(nodeY)) { continue; }
			inputs.push({ value: nodeY, count: nodeBucket.totalCount });
			observed.add(node);
			lastObserved.set(node, { time, value: nodeY });
		}
		for (const [node, last] of lastObserved) {
			if (observed.has(node)) { continue; }
			if (time - last.time > (horizonByNode.get(node) ?? 0)) {
				// Buckets are walked in ascending order, so this observation can
				// only get staler — drop it rather than re-testing it against
				// every remaining bucket. A node that reports again is re-added
				// by the observed-node loop above. Matters on wide windows over a
				// cluster whose node ids churn (rolling replacement, autoscaling),
				// where the map would otherwise accumulate every node ever seen.
				lastObserved.delete(node);
				continue;
			}
			// Carried, not observed — count 0 so `SeriesPoint.count` (confidence
			// gating, tooltips) keeps reflecting real samples only.
			inputs.push({ value: last.value, count: 0 });
		}
		points.push({ x: time, y: aggregate(crossNode, inputs), count });
	}
	return points;
}

/**
 * Two-pass aggregation: temporal (inner, per-node) → crossNode (outer, across
 * nodes within the same time bucket). Returns the final y plus the summed
 * per-node totalCount for the bucket.
 */
function aggregateTwoPass(
	temporal: Aggregator,
	crossNode: Aggregator,
	perNode: Map<string, NodeBucket>,
): { y: number | null; count: number } {
	const perNodeAggs: AggInput[] = [];
	let totalCount = 0;
	for (const [, nodeBucket] of perNode) {
		const nodeY = aggregate(temporal, nodeBucket.items);
		if (typeof nodeY === 'number' && Number.isFinite(nodeY)) {
			perNodeAggs.push({ value: nodeY, count: nodeBucket.totalCount });
		}
		totalCount += nodeBucket.totalCount;
	}
	const y = aggregate(crossNode, perNodeAggs);
	return { y, count: totalCount };
}
