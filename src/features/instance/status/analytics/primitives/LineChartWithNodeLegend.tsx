// Wraps LineChart with a shared NodeLegend below the chart, hiding the
// in-chart Recharts <Legend>. Used by generic-dispatch line panels
// (utilization, tls-reused, storage-volume, database-size,
// main-thread-utilization) so they get the same per-node legend
// behavior as the chip-selector panels and small-multiples grids.

import { useMemo } from 'react';
import { NodeLegend } from '../charts/NodeLegend.tsx';
import { useNodeSelection } from '../hooks/useNodeSelection.ts';
import { getNodeColor } from '../lib/nodeColors.ts';
import type { AxisSpec, SeriesData } from '../types/analytics.ts';
import { LineChart } from './LineChart.tsx';

interface Props {
	data: SeriesData;
	theme: 'light' | 'dark';
	yAxis?: AxisSpec | { left: AxisSpec; right?: AxisSpec };
	xDomain?: [number, number];
	fillParent?: boolean;
}

function extractNode(seriesKey: string): string | null {
	const sep = seriesKey.indexOf('|');
	if (sep !== -1) { return seriesKey.slice(sep + 1); }
	// Some specs (utilization, tls-reused, storage-volume) groupBy 'node'
	// directly — the series key IS the node id, no separator.
	return seriesKey;
}

export function LineChartWithNodeLegend({ data, theme, yAxis, xDomain, fillParent }: Props) {
	// All series are per-node when this component is used (either via
	// pipeline perNode mode or groupBy:'node'). Collect node ids from
	// series keys.
	const nodeIds = useMemo(() => {
		const set = new Set<string>();
		for (const s of data.series) {
			const node = extractNode(s.key);
			if (node) { set.add(node); }
		}
		return [...set].sort();
	}, [data]);

	const { isActive, handleLegendClick } = useNodeSelection(nodeIds);

	const filteredData = useMemo<SeriesData>(() => ({
		...data,
		series: data.series
			.filter((s) => {
				const node = extractNode(s.key);
				return node === null || isActive(node);
			})
			.map((s) => {
				const node = extractNode(s.key);
				if (!node) { return s; }
				return { ...s, color: s.color ?? getNodeColor(node, nodeIds) };
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
