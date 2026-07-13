// Shared renderer for derived metrics keyed by (path, time) that the
// operator wants to drill into per-node and filter by path. Used by
// request-rate (req/s) and error-rate (errored fraction). Each metric
// supplies a `compute(records, perNode, selectedPath)` callback that
// emits SeriesData; this component handles all the chip/node UI plus
// the path-discovery + viewMode threading.

import { useMemo, useState } from 'react';
import { NodeLegend } from '../charts/NodeLegend.tsx';
import { useNodeSelection } from '../hooks/useNodeSelection.ts';
import { getNodeColor } from '../lib/nodeColors.ts';
import { shortenNodeLabel } from '../lib/nodeLabels.ts';
import type { AnalyticsDataPoint, AxisSpec, SeriesData, Threshold, TimeRange } from '../types/analytics.ts';
import { DimensionChipRow } from './DimensionChipRow.tsx';
import { LineChart } from './LineChart.tsx';

interface Props {
	records: AnalyticsDataPoint[];
	timeRange?: TimeRange;
	nodes: string[];
	/** @deprecated Ignored — theming resolves via `--chart-*` CSS tokens.
	 *  Kept optional only while pipeline renderers (owned by a parallel
	 *  refactor) still pass it. */
	theme?: 'light' | 'dark';
	viewMode?: 'per-node' | 'aggregate';
	yAxis?: AxisSpec | { left: AxisSpec; right?: AxisSpec };
	thresholds?: Threshold[];
	fillParent?: boolean;
	/** Compute the SeriesData for the chosen viewMode + selected path.
	 *  - per-node + path selected: emit one series per node (key is node id)
	 *  - aggregate + path selected: emit one cluster series for that path
	 *  - aggregate + no selection: emit one series per path (cluster aggregate) */
	compute: (
		records: AnalyticsDataPoint[],
		options: { perNode: boolean; selectedPath: string | null },
	) => SeriesData;
}

export function PerPathRateRenderer({
	records,
	timeRange,
	nodes,
	viewMode = 'per-node',
	yAxis,
	thresholds,
	compute,
	fillParent,
}: Props) {
	const xDomain = timeRange ? [timeRange.startTime, timeRange.endTime] as [number, number] : undefined;
	const perNode = viewMode === 'per-node';

	// Discover paths from records, ranked by total count so default chip
	// selection lands on the highest-traffic path.
	const paths = useMemo(() => {
		const totals = new Map<string, number>();
		for (const r of records) {
			const path = (r as Record<string, unknown>).path;
			if (typeof path !== 'string') { continue; }
			const c = (r as Record<string, unknown>).count;
			const count = typeof c === 'number' && Number.isFinite(c) ? c : 0;
			totals.set(path, (totals.get(path) ?? 0) + count);
		}
		return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
	}, [records]);

	const [selected, setSelected] = useState<string>('');
	const effective = paths.includes(selected)
		? selected
		// In per-node mode default to the rank-0 path so the operator sees
		// one path's per-node breakdown immediately. In aggregate mode
		// default to "all" so the operator sees the cluster-by-path stack.
		: (perNode ? (paths[0] ?? '') : '');

	const data = useMemo<SeriesData>(
		() => compute(records, { perNode, selectedPath: effective || null }),
		[records, perNode, effective, compute],
	);

	const { isActive, handleLegendClick } = useNodeSelection(nodes);

	const filteredData: SeriesData = useMemo(() => ({
		...data,
		thresholds: thresholds ?? data.thresholds,
		series: data.series
			.map((s) => {
				// In per-node mode the series key IS the node id (no '|' prefix).
				if (!perNode) { return s; }
				return { ...s, label: shortenNodeLabel(s.key), color: getNodeColor(s.key, nodes) };
			})
			.filter((s) => !perNode || isActive(s.key)),
	}), [data, perNode, nodes, isActive, thresholds]);

	return (
		<div className="flex h-full flex-col">
			{
				/* Path selector above the chart (consistent with the rest of the
			    dashboards). Node legend stays at the bottom as a color key. */
			}
			{paths.length > 0 && (
				<DimensionChipRow
					dimensionValues={paths}
					selected={effective}
					onSelect={setSelected}
					ariaLabel="Path"
				/>
			)}
			<div className="min-h-0 flex-1" style={{ marginTop: paths.length > 0 ? 8 : 0 }}>
				<LineChart
					data={filteredData}
					yAxis={yAxis}
					xDomain={xDomain}
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
