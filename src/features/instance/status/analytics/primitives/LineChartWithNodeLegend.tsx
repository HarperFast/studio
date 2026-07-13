// Wraps LineChart with a shared NodeLegend below the chart, hiding the
// in-chart Recharts <Legend>. Used by generic-dispatch line panels
// (utilization, tls-reused, storage-volume, database-size,
// main-thread-utilization) so they get the same per-node legend
// behavior as the chip-selector panels and small-multiples grids.

import { useMemo } from 'react';
import { NodeLegend } from '../charts/NodeLegend.tsx';
import { useNodeSelection } from '../hooks/useNodeSelection.ts';
import { getNodeColor } from '../lib/nodeColors.ts';
import type { AxisSpec, Series, SeriesData } from '../types/analytics.ts';
import { LineChart } from './LineChart.tsx';

interface Props {
	data: SeriesData;
	theme: 'light' | 'dark';
	yAxis?: AxisSpec | { left: AxisSpec; right?: AxisSpec };
	xDomain?: [number, number];
	fillParent?: boolean;
}

/** Legend/filter group for a series: the structured `node` when present
 *  (per-node pipeline output — including groupBy-'node' specs like
 *  utilization / tls-reused / storage-volume), else the whole key. The
 *  fallback is deliberate: generic 'line' dispatch also feeds this wrapper
 *  cluster-aggregate series keyed by dimension value (e.g. database-size
 *  groupBy 'database' with perNode=false) and derived per-node series keyed
 *  by node id — both want one legend chip per key. Contrast SmallMultiples,
 *  which legends per-node series only. */
function legendGroup(s: Series): string {
	return s.node ?? s.key;
}

export function LineChartWithNodeLegend({ data, theme, yAxis, xDomain, fillParent }: Props) {
	const nodeIds = useMemo(() => {
		const set = new Set<string>();
		for (const s of data.series) {
			const group = legendGroup(s);
			if (group) { set.add(group); }
		}
		return [...set].sort();
	}, [data]);

	const { isActive, handleLegendClick } = useNodeSelection(nodeIds);

	const filteredData = useMemo<SeriesData>(() => ({
		...data,
		series: data.series
			.filter((s) => {
				const group = legendGroup(s);
				return group === '' || isActive(group);
			})
			.map((s) => {
				const group = legendGroup(s);
				if (!group) { return s; }
				return { ...s, color: s.color ?? getNodeColor(group, nodeIds) };
			}),
	}), [data, isActive, nodeIds]);

	return (
		<div className="flex h-full flex-col">
			<div className="min-h-0 flex-1">
				<LineChart
					data={filteredData}
					theme={theme}
					yAxis={yAxis}
					xDomain={xDomain}
					fillParent={fillParent}
					hideLegend
				/>
			</div>
			{nodeIds.length > 0 && (
				<NodeLegend
					nodeIds={nodeIds}
					isActive={isActive}
					onClickNode={handleLegendClick}
				/>
			)}
		</div>
	);
}
