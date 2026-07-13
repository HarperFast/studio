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
	FieldExpr,
	FieldSpec,
	MetricSpec,
	Series,
	SeriesData,
	SeriesPoint,
	TimeRange,
} from '../types/analytics.ts';
import { type AggInput, aggregate } from './aggregators.ts';
import { labelWithApprox } from './approxLabel.ts';
import { classifyConfidence } from './confidence.ts';
import { evalFieldExpr } from './fieldExpr.ts';
import { runTransform } from './runTransform.ts';

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
	// A misconfigured non-positive fallbackMs gets the same treatment as a
	// bad record period — rates must never divide by zero or flip sign.
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
		const t = (record as any).id;
		return typeof t === 'number' && Number.isFinite(t) ? t : null;
	}
	// 'time-or-id'
	const t = record.time;
	if (typeof t === 'number' && Number.isFinite(t)) { return t; }
	const id = (record as any).id;
	return typeof id === 'number' && Number.isFinite(id) ? id : null;
}

function projectValue(
	spec: MetricSpec,
	fieldSpec: FieldSpec,
	record: AnalyticsDataPoint,
): number | null {
	const raw = typeof fieldSpec.field === 'string'
		? (typeof record[fieldSpec.field] === 'number' ? (record[fieldSpec.field] as number) : null)
		: evalFieldExpr(fieldSpec.field as FieldExpr, record);
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
	// Step 4.5 structure: dim → time → node → NodeBucket. Per-dimension totals
	// are accumulated separately for topN ranking + per-series confidence
	// gating.
	const buckets = new Map<string | number, Map<number, Map<string, NodeBucket>>>();
	const dimTotals = new Map<string | number, number>();
	const warnedTimes = new Set<string>();
	for (const r of records) {
		const dimVal = r[src.dimension];
		if (typeof dimVal !== 'string' && typeof dimVal !== 'number') { continue; }
		const v = projectValue(spec, src.field, r);
		if (v === null) { continue; }
		const resolvedTime = resolveTime(spec, r);
		if (resolvedTime === null) {
			const key = `${String(r[src.dimension])}|${String(r.time)}`;
			if (!warnedTimes.has(key)) {
				warnedTimes.add(key);
				console.warn('[runGroupBy] Dropping record with no resolvable timestamp:', {
					dimension: r[src.dimension],
					time: r.time,
					id: (r as any).id,
					timestamp: spec.timestamp ?? 'time',
				});
			}
			continue;
		}
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
	}

	const tempAgg: Aggregator = src.field.aggregator?.temporal ?? spec.aggregator.temporal;
	const crossAgg: Aggregator = src.field.aggregator?.crossNode ?? spec.aggregator.crossNode;
	const isApprox = tempAgg === 'count-weighted-mean' || crossAgg === 'count-weighted-mean';

	// Apply topN + otherBucket: rank dimensions by totalCount descending, keep
	// the top N, roll the rest into an `Other` aggregate if otherBucket is on.
	const ranked = [...dimTotals.entries()].sort((a, b) => b[1] - a[1]);
	const topN = src.topN ?? Infinity;
	const kept = ranked.slice(0, topN);
	const rest = ranked.slice(topN);

	const series: Series[] = [];
	let suppressedSeriesCount = 0;
	for (const [key, total] of kept) {
		const confClass = classifyConfidence(
			total,
			spec.confidence && {
				greyBelow: spec.confidence.greyBelow,
				suppressBelow: spec.confidence.suppressBelow,
			},
		);
		if (confClass === 'suppress') {
			suppressedSeriesCount++;
			continue;
		}
		const perTime = buckets.get(key);
		if (!perTime) { continue; }
		// When the spec already groups by node, perNode is redundant — emitting
		// one series per (node, node) would duplicate. Fall through to the
		// cluster-aggregate path which, for dimension='node', is naturally
		// one-series-per-node.
		const dimensionIsNode = src.dimension === 'node';
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
			const points: SeriesPoint[] = [];
			const sortedTimes = [...perTime.keys()].sort((a, b) => a - b);
			for (const time of sortedTimes) {
				const byNode = perTime.get(time)!;
				const { y, count } = aggregateTwoPass(tempAgg, crossAgg, byNode);
				points.push({ x: time, y, count });
			}
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
		const confClass = classifyConfidence(
			otherTotal,
			spec.confidence && {
				greyBelow: spec.confidence.greyBelow,
				suppressBelow: spec.confidence.suppressBelow,
			},
		);
		if (confClass !== 'suppress') {
			const otherPerTime = new Map<number, Map<string, NodeBucket>>();
			for (const [key] of rest) {
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
			const otherPoints: SeriesPoint[] = [];
			const sortedTimes = [...otherPerTime.keys()].sort((a, b) => a - b);
			for (const time of sortedTimes) {
				const byNode = otherPerTime.get(time)!;
				const { y, count } = aggregateTwoPass(tempAgg, crossAgg, byNode);
				otherPoints.push({ x: time, y, count });
			}
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
	const warnedTimes = new Set<string>();
	const seriesArrays: Series[][] = fields.map((f) => {
		// time → node → NodeBucket
		const buckets = new Map<number, Map<string, NodeBucket>>();
		for (const r of records) {
			const resolvedTime = resolveTime(spec, r);
			if (resolvedTime === null) {
				const key = `${f.label}|${String(r.time)}`;
				if (!warnedTimes.has(key)) {
					warnedTimes.add(key);
					console.warn('[runFieldSpecs] Dropping record with no resolvable timestamp:', {
						field: f.label,
						time: r.time,
						id: (r as any).id,
						timestamp: spec.timestamp ?? 'time',
					});
				}
				continue;
			}
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
		}
		const tempAgg = f.aggregator?.temporal ?? spec.aggregator.temporal;
		const crossAgg = f.aggregator?.crossNode ?? spec.aggregator.crossNode;
		const isApprox = tempAgg === 'count-weighted-mean' || crossAgg === 'count-weighted-mean';
		const fieldKey = typeof f.field === 'string' ? f.field : f.label;

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
		const points: SeriesPoint[] = [];
		const sortedTimes = [...buckets.keys()].sort((a, b) => a - b);
		for (const t of sortedTimes) {
			const byNode = buckets.get(t)!;
			const { y, count } = aggregateTwoPass(tempAgg, crossAgg, byNode);
			points.push({ x: t, y, count });
		}
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
