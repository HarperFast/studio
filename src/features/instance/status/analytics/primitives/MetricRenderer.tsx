import { Component, type ReactNode } from 'react';
import { derivedRegistry } from '../pipeline/derived/index';
import { specRegistry } from '../pipeline/index';
import { runPipeline } from '../pipeline/pipeline';
import type { AnalyticsDataPoint, AxisSpec, MetricSpec, SeriesData, TimeRange } from '../types/analytics';
import { FallbackRenderer } from './FallbackRenderer';
import { LineChartWithNodeLegend } from './LineChartWithNodeLegend';
import { SmallMultiples } from './SmallMultiples';
import { StackedAreaChart } from './StackedAreaChart';

function renderPrimitive(
	primitive: MetricSpec['primitive'],
	data: SeriesData,
	yAxis: MetricSpec['yAxis'],
	xDomain?: [number, number],
	fillParent?: boolean,
) {
	switch (primitive) {
		case 'line':
			return <LineChartWithNodeLegend data={data} yAxis={yAxis} xDomain={xDomain} fillParent={fillParent} />;
		case 'stacked-area':
			return (
				<StackedAreaChart
					data={data}
					yAxis={yAxis as AxisSpec}
					xDomain={xDomain}
					fillParent={fillParent}
				/>
			);
		case 'small-multiples':
			throw new Error('small-multiples is dispatched at the spec branch, not via renderPrimitive');
		case 'heatmap':
			throw new Error('heatmap dispatch is via custom Renderer (replication-latency)');
		default:
			throw new Error(`Unknown primitive: ${primitive as string}`);
	}
}

// ─── Generic-dispatch predicates ─────────────────────────────────────────────
// Named guards for the spec-dispatch branches below, so each condition reads
// as intent instead of a wall of `&&`s.

/** Stacked-area spec grouped on a non-node dimension while the user asked for
 *  per-node view — restack the same field by node instead. */
function wantsStackedAreaNodeRemap(spec: MetricSpec, isPerNodeMode: boolean): boolean {
	return spec.primitive === 'stacked-area'
		&& isPerNodeMode
		&& spec.series.kind === 'groupBy'
		&& spec.series.dimension !== 'node';
}

/** Line spec grouped BY node while the user asked for the aggregate view —
 *  fold the nodes into a single cluster-wide line. */
function wantsClusterLineFold(spec: MetricSpec, isPerNodeMode: boolean): boolean {
	return spec.primitive === 'line'
		&& !isPerNodeMode
		&& spec.series.kind === 'groupBy'
		&& spec.series.dimension === 'node';
}

/** Line spec grouped on a non-node dimension (e.g. database-size groupBy
 *  'database'). The default per-node split emits one series per (dim, node)
 *  and the LineChartWithNodeLegend wrapper extracts only the node id from the
 *  key — so two dimension values on a single-node Harper render as two lines
 *  sharing the same color and a single legend entry. Run the pipeline with
 *  perNode=false so series keys are just the dimension values; the wrapper
 *  then renders one legend chip per dimension value (colored via
 *  getNodeColor's deterministic hash). The crossNode aggregator on the spec
 *  folds nodes into the cluster-wide line per dimension. */
function wantsDimensionLineSplit(spec: MetricSpec): boolean {
	return spec.primitive === 'line'
		&& spec.series.kind === 'groupBy'
		&& spec.series.dimension !== 'node';
}

interface MetricErrorBoundaryProps {
	children: ReactNode;
	fallback: ReactNode;
}

class MetricErrorBoundary extends Component<MetricErrorBoundaryProps, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	componentDidCatch(error: Error) {
		console.error('[MetricRenderer] render failed; falling back:', error);
	}
	render() {
		return this.state.failed ? this.props.fallback : this.props.children;
	}
}

interface Props {
	metric: string;
	records: AnalyticsDataPoint[];
	window: TimeRange;
	nodes: string[];
	viewMode?: 'per-node' | 'aggregate';
	/** When true, the chart fills its parent's vertical space (used by the
	 *  expand-to-fullscreen dialog). The parent must be a definite-height
	 *  flex column for this to resolve. */
	fillParent?: boolean;
}

export function MetricRenderer({
	metric,
	records,
	window: timeRange,
	nodes,
	viewMode,
	fillParent,
}: Props) {
	const errorFallback = (
		<FallbackRenderer
			metric={metric}
			records={records}
			hint="Render failed — showing fallback."
		/>
	);

	const xDomain: [number, number] = [timeRange.startTime, timeRange.endTime];
	let body: ReactNode;
	const derived = derivedRegistry[metric];
	if (derived) {
		if (derived.Renderer) {
			body = (
				<derived.Renderer
					records={records}
					timeRange={timeRange}
					nodes={nodes}
					viewMode={viewMode}
					fillParent={fillParent}
				/>
			);
		} else {
			const seriesData = derived.recompute(records, timeRange, nodes, viewMode);
			body = renderPrimitive(derived.primitive, seriesData, derived.yAxis, xDomain, fillParent);
		}
	} else {
		const entry = specRegistry[metric];
		if (entry?.Renderer) {
			body = (
				<entry.Renderer
					records={records}
					timeRange={timeRange}
					nodes={nodes}
					viewMode={viewMode}
					fillParent={fillParent}
				/>
			);
		} else if (entry?.spec) {
			const isPerNodeMode = (viewMode ?? 'per-node') === 'per-node';
			if (entry.spec.primitive === 'small-multiples') {
				const outerSpec = entry.spec;
				const series = outerSpec.series;
				if (series.kind !== 'field') {
					throw new Error("small-multiples requires kind='field' series source");
				}
				const panels = series.fields.map((field) => {
					const innerSpec: MetricSpec = {
						...outerSpec,
						series: { kind: 'field', fields: [field] },
						aggregator: {
							temporal: field.aggregator?.temporal ?? outerSpec.aggregator.temporal,
							crossNode: field.aggregator?.crossNode ?? outerSpec.aggregator.crossNode,
						},
					};
					return {
						title: field.label,
						data: runPipeline(innerSpec, records, timeRange, nodes, { perNode: isPerNodeMode, snapToPeriod: true }),
						yAxis: field.yAxis ?? outerSpec.yAxis,
					};
				});
				body = <SmallMultiples panels={panels} xDomain={xDomain} fillParent={fillParent} />;
			} else if (wantsStackedAreaNodeRemap(entry.spec, isPerNodeMode) && entry.spec.series.kind === 'groupBy') {
				const remapped: MetricSpec = {
					...entry.spec,
					series: { ...entry.spec.series, dimension: 'node' },
				};
				const seriesData = runPipeline(remapped, records, timeRange, nodes, { snapToPeriod: true });
				body = renderPrimitive('stacked-area', seriesData, entry.spec.yAxis, xDomain, fillParent);
			} else if (wantsClusterLineFold(entry.spec, isPerNodeMode) && entry.spec.series.kind === 'groupBy') {
				const groupSrc = entry.spec.series;
				const inner: MetricSpec = {
					...entry.spec,
					series: { kind: 'field', fields: [{ ...groupSrc.field, label: 'cluster' }] },
				};
				const seriesData = runPipeline(inner, records, timeRange, nodes, { snapToPeriod: true });
				body = renderPrimitive(entry.spec.primitive, seriesData, entry.spec.yAxis, xDomain, fillParent);
			} else if (wantsDimensionLineSplit(entry.spec)) {
				const seriesData = runPipeline(entry.spec, records, timeRange, nodes, {
					perNode: false,
					snapToPeriod: true,
				});
				body = renderPrimitive('line', seriesData, entry.spec.yAxis, xDomain, fillParent);
			} else {
				const seriesData = runPipeline(entry.spec, records, timeRange, nodes, {
					perNode: isPerNodeMode,
					snapToPeriod: true,
				});
				body = renderPrimitive(entry.spec.primitive, seriesData, entry.spec.yAxis, xDomain, fillParent);
			}
		} else {
			body = <FallbackRenderer metric={metric} records={records} />;
		}
	}

	return <MetricErrorBoundary key={metric} fallback={errorFallback}>{body}</MetricErrorBoundary>;
}
