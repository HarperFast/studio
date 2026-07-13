// Factory tables for the pure-wrapper metric specs. Most per-metric files in
// this directory were byte-identical apart from a handful of strings, so each
// is a single `make*Metric` table entry here instead of its own file. The old
// file paths remain as thin re-exports for existing consumers; the registry in
// `index.ts` reads entries straight from this table. Bespoke renderers
// (connection, memory, main-thread-utilization, replication-latency) keep
// their own files.
//
// Adding a pure-wrapper metric = one entry below + one line in
// `index.ts#specRegistry`.

import type { ComponentType } from 'react';
import { DimensionSelectorRenderer } from '../primitives/DimensionSelectorRenderer';
import { TrafficByTypeRenderer } from '../primitives/TrafficByTypeRenderer';
import type { MetricSpec, SpecRegistryRendererProps } from '../types/analytics';
import { QUANTILE_DEFAULT, QUANTILE_FIELDS } from './quantileFields';

export interface WrapperMetric {
	spec: MetricSpec;
	Renderer: ComponentType<SpecRegistryRendererProps>;
}

/** A metric whose renderer is `DimensionSelectorRenderer` with the given
 *  chip-row `ariaLabel` — the spec fields pass through verbatim. */
export function makeDimensionSelectorMetric(
	{ ariaLabel, ...spec }: MetricSpec & { ariaLabel: string },
): WrapperMetric {
	return {
		spec,
		Renderer: (props: SpecRegistryRendererProps) => (
			<DimensionSelectorRenderer spec={spec} {...props} ariaLabel={ariaLabel} />
		),
	};
}

/** A metric whose renderer is `TrafficByTypeRenderer` stacking on `typeField`.
 *  `defaultViewMode` (if set) applies when the panel doesn't pass one. */
export function makeTrafficByTypeMetric(
	{ typeField, defaultViewMode, ...spec }: MetricSpec & {
		typeField: string;
		defaultViewMode?: 'per-node' | 'aggregate';
	},
): WrapperMetric {
	return {
		spec,
		Renderer: (props: SpecRegistryRendererProps) => (
			<TrafficByTypeRenderer
				spec={spec}
				typeField={typeField}
				{...props}
				viewMode={props.viewMode ?? defaultViewMode}
			/>
		),
	};
}

/** The six per-path latency-quantile metrics (db-read/write/message,
 *  duration, transfer, cache-resolution) share the full spec shape — a
 *  line chart of p95 (quantile-selectable p1…p999) grouped by `path`,
 *  count-weighted-mean both temporally and cross-node, top 10 + Other,
 *  standard confidence gating. Only the strings differ. */
function makeLatencyQuantileMetric(
	{ label, ...cfg }: {
		ariaLabel: string;
		title: string;
		description: string;
		tab: MetricSpec['tab'];
		/** series.field label, e.g. 'p95 read (ms)'. */
		label: string;
	},
): WrapperMetric {
	return makeDimensionSelectorMetric({
		...cfg,
		primaryDimension: 'path',
		subDimension: 'method',
		series: {
			kind: 'groupBy',
			dimension: 'path',
			field: { field: 'p95', label },
			topN: 10,
			otherBucket: true,
		},
		timestamp: 'time',
		bucket: { source: 'period-field', fallbackMs: 60000 },
		aggregator: { temporal: 'count-weighted-mean', crossNode: 'count-weighted-mean' },
		confidence: { greyBelow: 40, suppressBelow: 100 },
		primitive: 'line',
		yAxis: { unit: '', formatter: 'ms' },
		quantileSelector: { fields: QUANTILE_FIELDS, default: QUANTILE_DEFAULT },
	});
}

/** bytes-sent / bytes-received differ only in title/description. */
function makeByteRateMetric(cfg: { title: string; description: string }): WrapperMetric {
	return makeTrafficByTypeMetric({
		...cfg,
		typeField: 'type',
		tab: 'traffic',
		primaryDimension: 'node',
		subDimension: 'type',
		series: {
			kind: 'groupBy',
			dimension: 'type',
			field: {
				field: {
					kind: 'op',
					op: '*',
					left: { kind: 'ref', field: 'count' },
					right: { kind: 'ref', field: 'mean' },
				},
				label: 'bytes/sec',
				transform: { kind: 'rate' },
			},
		},
		timestamp: 'time',
		bucket: { source: 'period-field', fallbackMs: 60000 },
		aggregator: { temporal: 'sum', crossNode: 'sum' },
		primitive: 'stacked-area',
		yAxis: { unit: '/s', formatter: 'bytes-si' },
	});
}

export const wrapperMetrics = {
	// ── DimensionSelectorRenderer wrappers ─────────────────────────────────
	'db-read': makeLatencyQuantileMetric({
		ariaLabel: 'Table',
		title: 'DB read p95',
		description: 'Per-table DB read p95 (count-weighted-mean) — top 10 tables + Other.',
		tab: 'db-activity',
		label: 'p95 read (ms)',
	}),
	'db-write': makeLatencyQuantileMetric({
		ariaLabel: 'Table',
		title: 'DB write p95',
		description: 'Per-table DB write p95 (count-weighted-mean) — top 10 tables + Other.',
		tab: 'db-activity',
		label: 'p95 write (ms)',
	}),
	'db-message': makeLatencyQuantileMetric({
		ariaLabel: 'Table',
		title: 'DB message p95',
		description: 'Per-table DB message p95 (count-weighted-mean) — top 10 tables + Other.',
		tab: 'db-activity',
		label: 'p95 message (ms)',
	}),
	'duration': makeLatencyQuantileMetric({
		ariaLabel: 'Path',
		title: 'Request duration (p95)',
		description: 'Per-path request duration p95 (count-weighted-mean) — top 10 paths + Other bucket.',
		tab: 'requests',
		label: 'p95 duration (ms)',
	}),
	'transfer': makeLatencyQuantileMetric({
		ariaLabel: 'Path',
		title: 'Transfer duration (p95)',
		description: 'Per-path transfer p95 (count-weighted-mean) — top 10 paths + Other.',
		tab: 'requests',
		label: 'p95 transfer (ms)',
	}),
	// Schema (per Harper get_analytics metric: 'cache-resolution'):
	//   { time, node, path, method, type, period, count, mean,
	//     p1, p10, p25, median, p75, p90, p95, p99, p999 }
	//
	// Time-to-resolve a cache miss, in milliseconds. Same per-path latency
	// distribution shape as `duration` and `transfer` so it shares their
	// renderer pattern: line chart with a path chip selector + a quantile
	// selector (p1…p999, default p95).
	'cache-resolution': makeLatencyQuantileMetric({
		ariaLabel: 'Path',
		title: 'Cache miss resolution (p95)',
		description: 'Per-path time-to-resolve a cache miss (count-weighted-mean) — top 10 paths + Other.',
		tab: 'requests',
		label: 'p95 resolution (ms)',
	}),
	// Schema (per Harper get_analytics metric: 'cache-hit'):
	//   { time, node, path, period, count, total, ratio }
	//
	// `ratio` is precomputed by Harper as `total / count` (hits / lookups). We
	// plot it directly with a count-weighted-mean cross-bucket so paths with
	// many lookups dominate the cluster line — a path with one lookup and a
	// 100% hit shouldn't drag the average up.
	'cache-hit': makeDimensionSelectorMetric({
		ariaLabel: 'Path',
		title: 'Cache hit rate',
		description: 'Per-path cache-hit ratio (count-weighted-mean) — top 10 paths + Other.',
		tab: 'requests',
		primaryDimension: 'path',
		series: {
			kind: 'groupBy',
			dimension: 'path',
			field: { field: 'ratio', label: 'hit ratio' },
			topN: 10,
			otherBucket: true,
		},
		timestamp: 'time',
		bucket: { source: 'period-field', fallbackMs: 60000 },
		aggregator: { temporal: 'count-weighted-mean', crossNode: 'count-weighted-mean' },
		// Same gating as duration / transfer — sample-thin paths grey out
		// rather than dragging the chart with one-off readings.
		confidence: { greyBelow: 40, suppressBelow: 100 },
		primitive: 'line',
		yAxis: { unit: '', formatter: 'percent', domain: [0, 1] },
	}),
	// Single-chart with chip selector (path: harper/user) + standard quantile
	// selector (p1..p999, default p95). Replaces the prior 3-panel
	// small-multiples view that locked operators to p50/p95/p99 only.
	'cpu-usage': makeDimensionSelectorMetric({
		ariaLabel: 'Scope',
		title: 'CPU — by scope (harper vs user)',
		description:
			'Per-path CPU utilization (count-weighted-mean) — chip selector picks scope; quantile selector picks percentile.',
		tab: 'health',
		primaryDimension: 'path',
		series: {
			kind: 'groupBy',
			dimension: 'path',
			field: { field: 'p95', label: 'CPU %' },
		},
		timestamp: 'time',
		bucket: { source: 'period-field', fallbackMs: 60000 },
		aggregator: { temporal: 'count-weighted-mean', crossNode: 'count-weighted-mean' },
		confidence: { greyBelow: 40, suppressBelow: 100 },
		primitive: 'line',
		yAxis: { unit: '', formatter: 'percent' },
		quantileSelector: { fields: QUANTILE_FIELDS, default: QUANTILE_DEFAULT },
	}),
	'success': makeDimensionSelectorMetric({
		ariaLabel: 'Path',
		title: 'Request success rate',
		description: 'Per-path success ratio (count-weighted-mean) — alert when ≥0.001 errors and Σcount ≥1000.',
		tab: 'requests',
		primaryDimension: 'path',
		subDimension: 'method',
		series: {
			kind: 'groupBy',
			dimension: 'path',
			// Harper omits `ratio` on operation/fastify-route records (~34% of the
			// fixture) but always emits total + count. Compute total/count via
			// FieldExpr instead of reading the optional `ratio` field directly so
			// those records aren't silently dropped — without this, the displayed
			// success-rate is biased toward whichever request types Harper happens
			// to ratio-tag. fieldExpr.ts returns null for count === 0 (div-by-zero
			// guard), so 0-count buckets still gap correctly.
			field: {
				field: {
					kind: 'op',
					op: '/',
					left: { kind: 'ref', field: 'total' },
					right: { kind: 'ref', field: 'count' },
				},
				label: 'success ratio',
			},
			topN: 10,
			otherBucket: true,
		},
		timestamp: 'time',
		bucket: { source: 'period-field', fallbackMs: 60000 },
		aggregator: { temporal: 'count-weighted-mean', crossNode: 'count-weighted-mean' },
		confidence: { greyBelow: 40, suppressBelow: 100 },
		primitive: 'line',
		yAxis: { unit: '', formatter: 'percent' },
		thresholds: [
			{ value: 0.999, label: '99.9% SLO', direction: 'below-is-bad', minCount: 1000 },
		],
	}),
	'response_200': makeDimensionSelectorMetric({
		ariaLabel: 'Path',
		title: 'HTTP 200 ratio',
		description: 'Per-path 2xx ratio (mean across nodes; count-weighted across time). Threshold 99.9%, min count 1000.',
		tab: 'requests',
		primaryDimension: 'path',
		subDimension: 'method',
		series: {
			kind: 'groupBy',
			dimension: 'path',
			// Harper omits `ratio` on operation/fastify-route records but always
			// emits total + count. Compute via FieldExpr to avoid silently
			// dropping ~34% of records. See the `success` entry above for the
			// matching rationale.
			field: {
				field: {
					kind: 'op',
					op: '/',
					left: { kind: 'ref', field: 'total' },
					right: { kind: 'ref', field: 'count' },
				},
				label: '200 ratio',
			},
			topN: 10,
			otherBucket: true,
		},
		timestamp: 'time',
		bucket: { source: 'period-field', fallbackMs: 60000 },
		aggregator: { temporal: 'mean', crossNode: 'count-weighted-mean' },
		confidence: { greyBelow: 40, suppressBelow: 100 },
		primitive: 'line',
		yAxis: { unit: '', formatter: 'percent' },
		thresholds: [
			{ value: 0.999, label: '99.9% SLO', direction: 'below-is-bad', minCount: 1000 },
		],
	}),
	// ── TrafficByTypeRenderer wrappers ──────────────────────────────────────
	'bytes-sent': makeByteRateMetric({
		title: 'Bytes sent by type',
		description: 'Outbound byte rate (count × mean) — cluster total. Type chips solo / Ctrl-toggle.',
	}),
	'bytes-received': makeByteRateMetric({
		title: 'Bytes received by type',
		description: 'Inbound byte rate (count × mean) — cluster total. Type chips solo / Ctrl-toggle.',
	}),
	// Schema note: this Harper build splits "active sessions" across two
	// metrics — `mqtt-connections` and `ws-connections` — each carrying a
	// `connections` field with the active-session snapshot. The unified
	// `connections` metric on this build is event-based (connect/disconnect)
	// not snapshot-based, so it isn't a substitute. The dashboard panel
	// (rendered by ConnectionsPanel in TrafficTab) fetches both metrics,
	// tags each row with a synthesized `type` field, and feeds the merged
	// stream into the renderer.
	'connections': makeTrafficByTypeMetric({
		typeField: 'type',
		title: 'Connections',
		description: 'Active sessions by type — chips solo / Ctrl-toggle. viewMode flips type/node stack.',
		tab: 'traffic',
		primaryDimension: 'node',
		subDimension: 'type',
		series: {
			kind: 'groupBy',
			dimension: 'type',
			field: {
				field: 'connections',
				label: 'connections',
				aggregator: { temporal: 'max', crossNode: 'sum' },
			},
		},
		timestamp: 'time',
		bucket: { source: 'period-field', fallbackMs: 60000 },
		aggregator: { temporal: 'max', crossNode: 'sum' },
		primitive: 'stacked-area',
		yAxis: { unit: '', formatter: 'count-si' },
	}),
	// Schema note: Harper emits database-size records with the per-database
	// byte total on the `size` column (analytics-viz's original spec said
	// `used`, which is stale relative to current Harper builds). Each row
	// also carries a `transactionLog` byte counter consumed by the
	// transaction-log-growth derived panel.
	//
	// Rendering: stacked-area with a multi-select chip row above the chart
	// (database names) and a node legend below — the same dual-legend
	// pattern Traffic-tab panels use. Operator can solo / Ctrl-toggle
	// databases or nodes; the chart updates live as records are filtered
	// pre-pipeline.
	//
	// Default `viewMode='aggregate'` so the stack reads "cluster total
	// broken out by database" — that's the operator's first question for
	// storage. Setting viewMode='per-node' on the panel toggles the stack
	// to "per-database total broken out by node" via TrafficByTypeRenderer's
	// built-in remap.
	'database-size': makeTrafficByTypeMetric({
		typeField: 'database',
		defaultViewMode: 'aggregate',
		title: 'Database size',
		description: 'Per-database size in bytes — chips solo / Ctrl-toggle databases; node legend filters by node.',
		tab: 'storage',
		primaryDimension: 'database',
		series: {
			kind: 'groupBy',
			dimension: 'database',
			field: { field: 'size', label: 'size (bytes)' },
		},
		timestamp: 'id',
		bucket: { source: 'period-field', fallbackMs: 60000 },
		aggregator: { temporal: 'last', crossNode: 'sum' },
		primitive: 'stacked-area',
		yAxis: { unit: ' B', formatter: 'bytes-si' },
	}),
} satisfies Record<string, WrapperMetric>;
