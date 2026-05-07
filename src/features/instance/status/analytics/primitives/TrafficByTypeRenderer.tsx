// Wrapper renderer for type-grouped panels (bytes-sent, bytes-received,
// mqtt-traffic-sent, mqtt-traffic-received, database-size, connections).
//
// Layout (top → bottom):
//   - TypeFilterChipRow: multi-select for typeField values (mqtt /
//     egress / operation / database name / etc.). Click solo, ⌘-click
//     toggle. Chips inherit the same hue as the corresponding stack
//     band so operator can map chip → band visually.
//   - "Stack by" segmented control (only when nodes.length > 1):
//     `Type` (default), `Node`, or `Per-node grid` (small multiples).
//   - Chart: stacked area when all selectors are active; bare stacked
//     lines when the operator narrows the selection (no fills swallowing
//     small bands during comparison).
//   - NodeLegend: solo/Ctrl-toggle. Filters which nodes contribute to
//     the stack pre-pipeline.

import { useMemo, useState } from 'react';
import { NodeLegend } from '../charts/NodeLegend.tsx';
import { useNodeSelection } from '../hooks/useNodeSelection.ts';
import { getTypeColor } from '../lib/colorAllocators/typeColors.ts';
import { getNodeColor } from '../lib/nodeColors.ts';
import { runPipeline } from '../pipeline/pipeline.ts';
import type { AnalyticsDataPoint, MetricSpec, Series, SeriesData, TimeRange } from '../types/analytics.ts';
import { SmallMultiples } from './SmallMultiples.tsx';
import { StackedAreaChart } from './StackedAreaChart.tsx';
import { TypeFilterChipRow, useTypeFilter } from './TypeFilterChipRow.tsx';

interface Props {
	/** Underlying spec (groupBy on `typeField`, primitive `stacked-area`). */
	spec: MetricSpec;
	/** Field on records that carries the type value (`type` or `protocol`). */
	typeField: string;
	records: AnalyticsDataPoint[];
	timeRange: TimeRange;
	nodes: string[];
	theme: 'light' | 'dark';
	/** Initial stack-by mode. Defaults to 'type' so the chart matches the
	 *  panel name's "by type" framing. The user-facing toggle is rendered
	 *  inside the renderer when nodes.length > 1. */
	viewMode?: 'per-node' | 'aggregate';
	fillParent?: boolean;
}

type StackBy = 'type' | 'node' | 'grid';

export function TrafficByTypeRenderer({
	spec,
	typeField,
	records,
	timeRange,
	nodes,
	theme,
	viewMode = 'aggregate',
	fillParent,
}: Props) {
	// Translate the legacy viewMode prop into the new stackBy state.
	// Default 'type' (== 'aggregate'); 'per-node' maps to 'node'.
	const [stackBy, setStackBy] = useState<StackBy>(viewMode === 'per-node' ? 'node' : 'type');

	// Discover unique type values from records.
	const types = useMemo(() => {
		const set = new Set<string>();
		for (const r of records) {
			const v = (r as Record<string, unknown>)[typeField];
			if (typeof v === 'string') { set.add(v); }
		}
		return [...set].sort();
	}, [records, typeField]);

	const { isActive, handleClick } = useTypeFilter(types);
	const { isActive: isNodeActive, handleLegendClick: handleNodeClick } = useNodeSelection(nodes);

	// "All active" = default state where no chip / node has been soloed.
	// Filled bands when summary; bare stacked lines when narrowed.
	const allTypesActive = types.length > 0 && types.every(isActive);
	const allNodesActive = nodes.length === 0 || nodes.every((n) => isNodeActive(n));
	const lineOnly = !(allTypesActive && allNodesActive);

	const filteredRecords = useMemo(
		() =>
			records.filter((r) => {
				const v = (r as Record<string, unknown>)[typeField];
				if (typeof v === 'string' && !isActive(v)) { return false; }
				if (typeof r.node === 'string' && !isNodeActive(r.node)) { return false; }
				return true;
			}),
		[records, typeField, isActive, isNodeActive],
	);

	// stackBy === 'node' remaps dimension to 'node'; 'type' keeps the
	// spec's natural typeField. 'grid' is handled separately below.
	const runtimeSpec = useMemo<MetricSpec>(() => {
		if (stackBy !== 'node' || spec.series.kind !== 'groupBy') { return spec; }
		return { ...spec, series: { ...spec.series, dimension: 'node' } };
	}, [spec, stackBy]);

	const data: SeriesData = useMemo(
		() => runPipeline(runtimeSpec, filteredRecords, timeRange, nodes, { snapToPeriod: true }),
		[runtimeSpec, filteredRecords, timeRange, nodes],
	);

	// Color each series by its key using the appropriate allocator so the
	// same type is the same hue across panels and the chip color matches
	// the band color.
	const coloredData: SeriesData = useMemo(() => ({
		...data,
		series: data.series.map((s): Series => ({
			...s,
			color: s.color
				?? (stackBy === 'node' ? getNodeColor(s.key, nodes) : getTypeColor(s.key, types)),
		})),
	}), [data, stackBy, nodes, types]);

	// Per-node grid: one mini-chart per active node, each stacked by type.
	// Built only when stackBy === 'grid' so we don't run N pipelines for
	// every render.
	const gridPanels = useMemo(() => {
		if (stackBy !== 'grid') { return null; }
		const activeNodes = nodes.filter(isNodeActive);
		return activeNodes.map((nodeId) => {
			const nodeRecords = filteredRecords.filter((r) => r.node === nodeId);
			const seriesData = runPipeline(spec, nodeRecords, timeRange, [nodeId], { snapToPeriod: true });
			return {
				title: nodeId,
				data: {
					...seriesData,
					series: seriesData.series.map((s): Series => ({
						...s,
						color: s.color ?? getTypeColor(s.key, types),
					})),
				},
				yAxis: spec.yAxis,
			};
		});
	}, [stackBy, nodes, isNodeActive, filteredRecords, spec, timeRange, types]);

	const showStackByToggle = nodes.length > 1;
	const xDomain: [number, number] = [timeRange.startTime, timeRange.endTime];

	return (
		<div className="flex h-full flex-col">
			<TypeFilterChipRow
				values={types}
				isActive={isActive}
				onClick={handleClick}
				colorFor={(v) => getTypeColor(v, types)}
				ariaLabel={typeField === 'type' ? 'Traffic type' : typeField === 'database' ? 'Database' : 'Protocol'}
			/>
			{showStackByToggle && <StackByToggle stackBy={stackBy} onChange={setStackBy} />}
			<div className="min-h-0 flex-1" style={{ marginTop: 8 }}>
				{stackBy === 'grid' && gridPanels
					? (
						<SmallMultiples
							panels={gridPanels}
							theme={theme}
							xDomain={xDomain}
							fillParent={fillParent}
						/>
					)
					: (
						<StackedAreaChart
							data={coloredData}
							theme={theme}
							yAxis={spec.yAxis as any}
							xDomain={xDomain}
							fillParent={fillParent}
							lineOnly={lineOnly}
						/>
					)}
			</div>
			{nodes.length > 0 && <NodeLegend nodeIds={nodes} isActive={isNodeActive} onClickNode={handleNodeClick} />}
		</div>
	);
}

interface StackByToggleProps {
	stackBy: StackBy;
	onChange: (s: StackBy) => void;
}

const STACK_BY_OPTIONS: ReadonlyArray<{ value: StackBy; label: string }> = [
	{ value: 'type', label: 'Type' },
	{ value: 'node', label: 'Node' },
	{ value: 'grid', label: 'Per-node grid' },
];

function StackByToggle({ stackBy, onChange }: StackByToggleProps) {
	return (
		<div
			role="radiogroup"
			aria-label="Stack by"
			className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[11px]"
		>
			<span className="text-muted-foreground">Stack by:</span>
			{STACK_BY_OPTIONS.map((opt) => {
				const active = stackBy === opt.value;
				return (
					<button
						key={opt.value}
						type="button"
						role="radio"
						aria-checked={active}
						data-testid="stack-by-button"
						data-value={opt.value}
						onClick={() => onChange(opt.value)}
						className="inline-flex items-center cursor-pointer border-none bg-transparent p-0 text-(--color-text-secondary)"
						style={{ opacity: active ? 1 : 0.3 }}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}
