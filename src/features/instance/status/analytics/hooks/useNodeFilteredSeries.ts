import { useMemo } from 'react';
import { getNodeColor } from '../lib/nodeColors.ts';
import { shortenNodeLabel } from '../lib/nodeLabels.ts';
import type { SeriesData } from '../types/analytics.ts';
import { useNodeSelection } from './useNodeSelection.ts';

/** Shared per-node scaffolding for chip-selector panels (connection, memory,
 *  main-thread, DimensionSelectorRenderer): relabels each per-node series
 *  (`Series.node` set by the pipeline) with the short node name + the node's
 *  stable color, then filters by the NodeLegend's active-node set.
 *  Cluster-aggregate series (no `node`) pass through untouched.
 *  `isActive`/`handleLegendClick` feed the panel's <NodeLegend>. */
export function useNodeFilteredSeries(data: SeriesData, nodes: string[]) {
	const { isActive, handleLegendClick } = useNodeSelection(nodes);
	const filteredData = useMemo<SeriesData>(() => ({
		...data,
		series: data.series
			.map((s) =>
				s.node === undefined
					? s
					: { ...s, label: shortenNodeLabel(s.node), color: getNodeColor(s.node, nodes) }
			)
			.filter((s) => s.node === undefined || isActive(s.node)),
	}), [data, nodes, isActive]);
	return { data: filteredData, isActive, handleLegendClick };
}
