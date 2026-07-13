import type { ValueFormatter } from '@/lib/formatValue';
import type { ComponentType, JSX } from 'react';

export interface AnalyticsDataPoint {
	time: number;
	node: string;
	[key: string]: unknown;
}

export interface AnalyticsResponse {
	data: AnalyticsDataPoint[];
}

export interface TableSizeRecord {
	metric: 'table-size';
	database: string;
	table: string;
	/** Harper serializes the timestamp as `id` (ms since epoch) for this metric. */
	id: number;
	/** Size in bytes. */
	size: number;
	/** Replication node name. Typed loosely because some Harper builds
	 *  serialize a numeric node name as a JSON number, or omit it entirely on
	 *  single-instance deployments. `normalizeRecords` coerces this to a string
	 *  at the pipeline boundary — consumers should read the normalized value. */
	node?: string | number | null;
}

export interface TimeRange {
	startTime: number;
	endTime: number;
}

export type ViewMode = 'aggregate' | 'per-node';

export type AutoRefreshInterval = 10_000 | 30_000 | 60_000 | 300_000 | 0;

// ─────────────────────────────────────────────────────────────────────────────
// Step 1a — Declarative spec types. Unused until Step 1b wires MetricRenderer
// into Dashboard; committing them here unblocks the primitives + pipeline.
// ─────────────────────────────────────────────────────────────────────────────

/** Evaluated per-record before temporal aggregation. Σ-arithmetic (e.g.
 *  error-rate's `1 − Σtotal/Σcount`) is NOT expressed here; it lives in a
 *  derived metric's own recompute. */
export type FieldExpr =
	| { kind: 'ref'; field: string }
	| { kind: 'const'; value: number }
	| { kind: 'op'; op: '+' | '-' | '*' | '/'; left: FieldExpr; right: FieldExpr };

export type Transform =
	| { kind: 'raw' }
	| { kind: 'scale'; factor: number }
	/** `value / period × 1000` → per-second. Returns null when `period ≤ 0`. */
	| { kind: 'rate' }
	/** Passthrough for [0, 1] fractions; primitives render as percent. */
	| { kind: 'ratio' }
	| { kind: 'compose'; steps: Transform[] }
	/** Lookup in `src/features/instance/status/analytics/pipeline/transforms.ts` — keyof typeof registry. */
	| { kind: 'named'; name: string };

export type Aggregator =
	| 'sum'
	| 'mean'
	| 'max'
	| 'min'
	| 'p50'
	| 'p95'
	| 'p99'
	| 'last'
	/** Σ(x·count)/Σ(count); labeled "(approx)" on percentile fields. Null records
	 *  drop from both numerator and denominator. */
	| 'count-weighted-mean';

export interface Threshold {
	value: number;
	label: string;
	direction: 'above-is-bad' | 'below-is-bad';
	/** Alert styling suppressed when bucket count < minCount. */
	minCount?: number;
	/** Apply only to records matching all given dimension values. */
	scope?: Partial<Record<string, string | number>>;
}

export type AxisFormatter = ValueFormatter;

export interface AxisSpec {
	unit: string;
	scale?: 'linear' | 'log';
	formatter?: AxisFormatter;
	domain?: [number | 'auto', number | 'auto'];
}

export interface FieldSpec {
	field: string | FieldExpr;
	label: string;
	transform?: Transform;
	aggregator?: { temporal?: Aggregator; crossNode?: Aggregator };
	role?: 'primary' | 'secondary' | 'ceiling';
	/** Only meaningful when MetricSpec.yAxis is split into `{left, right}`. */
	axis?: 'left' | 'right';
	/** Per-field y-axis override; consumed by small-multiples to give each panel
	 *  its own scale/formatter. Falls back to the outer MetricSpec.yAxis. */
	yAxis?: AxisSpec;
}

export type SeriesSource =
	| { kind: 'field'; fields: FieldSpec[] }
	| {
		kind: 'groupBy';
		dimension: string;
		field: FieldSpec;
		topN?: number;
		otherBucket?: boolean;
	};

export type TabId = 'health' | 'traffic' | 'requests' | 'db-activity' | 'replication' | 'storage' | 'new';

export interface MetricSpec {
	title: string;
	description: string;
	tab: TabId;
	primaryDimension: string | string[];
	subDimension?: string | string[];
	series: SeriesSource;
	timestamp?: 'time' | 'id' | 'time-or-id';
	/** Bucket sizing. `'period-field'` (read each record's `period`, fall back
	 *  to `fallbackMs`) is the only implemented source — the type is narrowed
	 *  to it so spec authors can't select an unimplemented strategy. Widen the
	 *  union again if/when `observed-interval` or `fixed` land in the pipeline. */
	bucket: { source: 'period-field'; fallbackMs?: number };
	/** Required on every committed spec; small-multiples specs often set a no-op
	 *  default here and override per field. */
	aggregator: { temporal: Aggregator; crossNode: Aggregator };
	/** Applied to the post-temporal-aggregation window count (not per-record).
	 *  The count always comes from summing `record.count` — there is no
	 *  configurable source field. */
	confidence?: { greyBelow?: number; suppressBelow?: number };
	primitive: 'line' | 'stacked-area' | 'small-multiples' | 'heatmap';
	yAxis: AxisSpec | { left: AxisSpec; right?: AxisSpec };
	layout?: { colSpan?: 1 | 2 };
	thresholds?: Threshold[];
	/** When set, renderers using DimensionSelectorRenderer expose a
	 *  quantile picker (e.g. p50/p95/p99). The selected entry replaces
	 *  the spec's series.field at runtime. Only applies to groupBy specs
	 *  whose backing records carry multiple percentile columns (duration,
	 *  transfer, db-read/write/message). */
	quantileSelector?: {
		fields: ReadonlyArray<{ field: string; label: string }>;
		default: string;
	};
}

export interface MetricGroupSpec {
	id: string;
	title: string;
	tab: TabId;
	strategy: 'stacked-rates' | 'overlay-ratios' | 'small-multiples';
	members: { kind: 'prefix'; prefix: string } | { kind: 'explicit'; names: string[] };
}

export interface DerivedMetricSpec {
	id: string;
	title: string;
	subtitle?: string;
	tab: TabId;
	sourceMetric: string;
	/** Reads raw source columns per-record and produces SeriesData. Does NOT
	 *  consume the source's FieldSpec aggregator output.
	 *  `viewMode` flows through MetricRenderer so derived metrics can swap
	 *  dimension (per-type → per-node) the same way generic spec dispatch
	 *  does for stacked-area panels. Optional for backward compatibility;
	 *  derived metrics that don't care can ignore it. */
	recompute: (
		records: AnalyticsDataPoint[],
		window: TimeRange,
		nodes: string[],
		viewMode?: 'per-node' | 'aggregate',
	) => SeriesData;
	primitive: MetricSpec['primitive'];
	yAxis: MetricSpec['yAxis'];
	thresholds?: Threshold[];
	layout?: MetricSpec['layout'];
	/** Optional custom React component. When present, MetricRenderer uses
	 *  it INSTEAD of the recompute → renderPrimitive flow — same role as
	 *  SpecRegistryEntry.Renderer for spec-driven metrics. Lets derived
	 *  metrics expose stateful UI (e.g. type filter chips). */
	Renderer?: (props: SpecRegistryRendererProps) => JSX.Element;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline output shape — what primitives receive.
// ─────────────────────────────────────────────────────────────────────────────

export interface SeriesPoint {
	x: number;
	y: number | null;
	count?: number;
}

export interface Series {
	/** Unique id within a SeriesData — used as React key / recharts series
	 *  name. For per-node pipeline output it is `makeSeriesKey(dim, node)`;
	 *  never parse it back (a dim containing '|' makes the string ambiguous).
	 *  Read the structured `dim`/`node` fields instead. */
	key: string;
	label: string;
	/** Dimension value (groupBy) or field key (field mode) this series was
	 *  bucketed under. Always set by runPipeline; may be absent on series
	 *  built outside the generic pipeline (derived metrics). */
	dim?: string;
	/** Node id when this series is a per-node breakdown (pipeline perNode
	 *  mode, or a groupBy-'node' spec where each dimension value IS a node).
	 *  Unset on cluster-aggregate series. */
	node?: string;
	color?: string;
	axis?: 'left' | 'right';
	points: SeriesPoint[];
	/** `true` when this series's aggregator produced an approximation. */
	approx?: boolean;
	/** Optional per-series rendering opacity (0–1). Used by primitives to dim
	 *  low-confidence series in line fallbacks where the aggregator's count
	 *  fell into the grey tier. Default 1. */
	opacity?: number;
}

export interface SeriesData {
	series: Series[];
	/** Optional ceiling / reference series (e.g. `rss` dashed ceiling). */
	ceiling?: Series;
	/** Forwarded by primitives to render reference lines. */
	thresholds?: Threshold[];
	/** Count series' hidden by confidence gate. Primitives show a sub-legend. */
	suppressedSeriesCount?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Heatmap shape + specRegistry entry. Additive; generic pipeline
// still emits SeriesData. HeatmapMatrix consumes HeatmapData.
// ─────────────────────────────────────────────────────────────────────────────

export interface HeatmapCell {
	row: string;
	col: string;
	/** Aggregated value for the cell (e.g. p95 latency ms). `null` when absent
	 *  (no records matched row×col in the window). */
	value: number | null;
	/** Post-aggregation record count. Consumed by confidence gating in the
	 *  primitive to dotted-border grey vs. transparent absent. */
	count?: number;
}

export interface HeatmapData {
	rows: string[];
	cols: string[];
	cells: HeatmapCell[];
	/** Optional colormap bounds; primitive auto-computes from finite cell values
	 *  when omitted. */
	valueRange?: { min: number; max: number };
	/** Optional unit + formatter for tooltip + aria-label. */
	axis?: AxisSpec;
	/** Forwarded by renderers for cell-level confidence classification. */
	confidence?: { greyBelow?: number; suppressBelow?: number };
	/** Axis labels for row/column headers (sighted + AT). */
	rowAxisLabel?: string;
	colAxisLabel?: string;
	/** Total records the renderer dropped, all causes combined
	 *  (= unparseablePathCount + missingValueCount for replication-latency).
	 *  Always populated (0 when none). */
	skippedRecordsCount: number;
	/** Records dropped because their `path` field could not be parsed into
	 *  source/db/table (orphan-source scenario). */
	unparseablePathCount?: number;
	/** Records dropped because the selected quantile field carried no finite
	 *  numeric value. */
	missingValueCount?: number;
	/** Source-node names recovered by the heuristic fallback in pathParser
	 *  — present in the data but NOT in the known-node list. Operator may
	 *  want to confirm these are real cluster peers vs decommissioned /
	 *  external sources. Empty when every parse anchored cleanly. */
	unrecognizedSources?: string[];
	/** Appended to cell aria-labels when the aggregator is approximate
	 *  (e.g. count-weighted-mean). Primitive does not introspect the
	 *  aggregator — the renderer sets this. */
	approx?: boolean;
	/** What the cells measure, for the color-scale legend and description
	 *  (e.g. "p95 latency", "p50 latency"). Defaults to "p95 latency" in the
	 *  primitive for backward compatibility; renderers with a quantile
	 *  selector should set it to match the selected quantile. */
	measureLabel?: string;
}

export interface SpecRegistryRendererProps {
	records: AnalyticsDataPoint[];
	/** Renamed from `window` to avoid shadowing the DOM `window`. */
	timeRange: TimeRange;
	nodes: string[];
	theme: 'light' | 'dark';
	viewMode?: 'per-node' | 'aggregate';
	/** When true, charts fill parent vertical space (expand dialog). */
	fillParent?: boolean;
}

export interface SpecRegistryEntry {
	spec: MetricSpec;
	/** Optional bespoke renderer for specs whose pipeline shape doesn't fit
	 *  `runPipeline() → SeriesData → primitive`. When present, MetricRenderer
	 *  delegates to it; when absent, MetricRenderer runs the generic pipeline
	 *  and dispatches to the primitive keyed by `spec.primitive`. */
	Renderer?: ComponentType<SpecRegistryRendererProps>;
}
