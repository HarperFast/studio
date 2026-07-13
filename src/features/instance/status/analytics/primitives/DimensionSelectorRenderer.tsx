// Shared chip-row + filtered LineChart pattern. Used by duration, success,
// transfer, response_200, db-{read,write,message}.
//
// Two ways to slice the data:
//   1. Pipeline runs once with `perNode: true` so series come back as
//      one-per-(dim, node). The chip selector still picks one DIMENSION
//      value (path/table/path·method) — filtering keeps every node line
//      for that dimension. Operator immediately sees which node is hot
//      for the selected path/table.
//   2. When spec.quantileSelector is set, the user can swap the underlying
//      percentile field (p50/p95/p99) via a small button group above the
//      chart. The pipeline re-runs with the chosen field substituted.

import { useMemo, useState } from 'react';
import { NodeLegend } from '../charts/NodeLegend';
import { useNodeFilteredSeries } from '../hooks/useNodeFilteredSeries';
import { useRovingRadioGroup } from '../hooks/useRovingRadioGroup';
import { runPipeline } from '../pipeline/pipeline';
import type { AnalyticsDataPoint, MetricSpec, SeriesData, TimeRange } from '../types/analytics';
import { DimensionChipRow } from './DimensionChipRow';
import { DimensionCombobox } from './DimensionCombobox';
import { LineChart } from './LineChart';

const OTHER_KEY = 'Other';
const CHIP_LIMIT = 12;

interface Props {
	spec: MetricSpec;
	records: AnalyticsDataPoint[];
	timeRange: TimeRange;
	nodes: string[];
	ariaLabel?: string;
	/** 'per-node' (default) breaks each chip-selected dimension into one
	 *  line per node; 'aggregate' folds nodes into one cluster series per
	 *  dim. */
	viewMode?: 'per-node' | 'aggregate';
	/** When true, the chart inside this renderer fills its parent's
	 *  vertical space — used by the expand-to-fullscreen dialog. */
	fillParent?: boolean;
}

export function DimensionSelectorRenderer({
	spec,
	records,
	timeRange,
	nodes,
	ariaLabel = 'Dimension',
	viewMode = 'per-node',
	fillParent,
}: Props) {
	const perNode = viewMode === 'per-node';
	// ── Quantile selector state (when spec opts in) ─────────────────────
	const quantileFields = spec.quantileSelector?.fields;
	const [quantile, setQuantile] = useState<string>(
		spec.quantileSelector?.default ?? '',
	);
	const effectiveQuantile = quantileFields?.some((q) => q.field === quantile)
		? quantile
		: (spec.quantileSelector?.default ?? '');

	// Roving-tabindex radiogroup behavior for the quantile picker (single tab
	// stop, arrow keys move focus + selection).
	const quantileValues = useMemo(() => quantileFields?.map((q) => q.field) ?? [], [quantileFields]);
	const { getRadioProps: getQuantileRadioProps } = useRovingRadioGroup(
		quantileValues,
		effectiveQuantile,
		setQuantile,
	);

	// Build the runtime spec — substitute the chosen percentile field if a
	// quantile selector is active. groupBy specs only.
	const runtimeSpec = useMemo<MetricSpec>(() => {
		if (!quantileFields || effectiveQuantile === '' || spec.series.kind !== 'groupBy') { return spec; }
		const chosen = quantileFields.find((q) => q.field === effectiveQuantile);
		if (!chosen) { return spec; }
		return {
			...spec,
			series: {
				...spec.series,
				field: { ...spec.series.field, field: chosen.field, label: chosen.label },
			},
		};
	}, [spec, quantileFields, effectiveQuantile]);

	const fullData = useMemo<SeriesData>(
		() => runPipeline(runtimeSpec, records, timeRange, nodes, { perNode, snapToPeriod: true }),
		[runtimeSpec, records, timeRange, nodes, perNode],
	);

	// Build the dimension list (the chip-row values) from each series's
	// structured `dim` field, excluding the special OTHER aggregate.
	const dimValues = useMemo(() => {
		const seen = new Set<string>();
		for (const s of fullData.series) {
			const dim = s.dim ?? s.key;
			if (dim === OTHER_KEY) { continue; }
			seen.add(dim);
		}
		return [...seen];
	}, [fullData.series]);

	const hasOther = fullData.series.some((s) => (s.dim ?? s.key) === OTHER_KEY);
	const [selectedDim, setSelectedDim] = useState<string>(() => dimValues[0] ?? '');
	const effectiveDim = dimValues.includes(selectedDim) ? selectedDim : (dimValues[0] ?? '');

	// Keep only the selected dimension's series, then apply the shared
	// per-node relabel/color/legend-filter scaffolding — the per-Recharts
	// <Legend> is hidden so the chart area gets full vertical real estate.
	const dimFilteredData: SeriesData = useMemo(() => ({
		...fullData,
		series: fullData.series.filter((s) => (s.dim ?? s.key) === effectiveDim),
	}), [fullData, effectiveDim]);
	const { data: filteredData, isActive, handleLegendClick } = useNodeFilteredSeries(dimFilteredData, nodes);

	return (
		<div className="flex h-full flex-col">
			{
				/* Selectors live above the chart (consistent with TrafficByTypeRenderer):
			    quantile (when the spec exposes one) on top, then the dimension
			    selector (chip row when ≤ CHIP_LIMIT values, combobox above it).
			    The chart fills the remaining space below; the per-node legend
			    stays at the bottom because it's a color key, not a selector. */
			}
			{spec.quantileSelector && quantileFields && quantileFields.length > 1 && (
				<div
					role="radiogroup"
					aria-label="Quantile"
					className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-2 text-[11px]"
				>
					{quantileFields.map((q, idx) => {
						const active = q.field === effectiveQuantile;
						return (
							<button
								key={q.field}
								type="button"
								{...getQuantileRadioProps(idx)}
								data-testid="quantile-button"
								data-value={q.field}
								className="inline-flex items-center cursor-pointer border-none bg-transparent p-0 text-(--color-text-secondary)"
								style={{ opacity: active ? 1 : 0.3 }}
							>
								{q.label}
							</button>
						);
					})}
				</div>
			)}
			{dimValues.length > CHIP_LIMIT
				? (
					<DimensionCombobox
						dimensionValues={dimValues}
						selected={effectiveDim}
						onSelect={setSelectedDim}
						otherKey={hasOther ? OTHER_KEY : undefined}
						ariaLabel={ariaLabel}
					/>
				)
				: (
					<DimensionChipRow
						dimensionValues={dimValues}
						selected={effectiveDim}
						onSelect={setSelectedDim}
						otherKey={hasOther ? OTHER_KEY : undefined}
						ariaLabel={ariaLabel}
					/>
				)}
			<div className="min-h-0 flex-1" style={{ marginTop: 8 }}>
				<LineChart
					data={filteredData}
					yAxis={spec.yAxis}
					xDomain={[timeRange.startTime, timeRange.endTime]}
					fillParent={fillParent}
					hideLegend={perNode}
				/>
			</div>
			{perNode && nodes.length > 0 && (
				<NodeLegend
					nodeIds={nodes}
					isActive={isActive}
					onClickNode={handleLegendClick}
				/>
			)}
		</div>
	);
}
