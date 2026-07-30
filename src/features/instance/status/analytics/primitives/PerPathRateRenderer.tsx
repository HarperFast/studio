// Shared renderer for derived metrics keyed by (path, time) that the
// operator wants to drill into per-node and filter by path. Used by
// request-rate (req/s) and error-rate (errored fraction). Each metric
// supplies a `compute(records, perNode, selectedPath)` callback that
// emits SeriesData; this component handles all the chip/node UI plus
// the path-discovery + viewMode threading.

import { useMemo, useState } from 'react';
import { NodeLegend } from '../charts/NodeLegend';
import { targetBucketMs } from '../context/timePresets';
import { useNodeSelection } from '../hooks/useNodeSelection';
import { getNodeColor } from '../lib/nodeColors';
import { shortenNodeLabel } from '../lib/nodeLabels';
import { downsampleDerivedSeriesData } from '../pipeline/downsample';
import type { Aggregator, AnalyticsDataPoint, AxisSpec, SeriesData, Threshold, TimeRange } from '../types/analytics';
import { DimensionChipRow } from './DimensionChipRow';
import { LineChart } from './LineChart';

interface Props {
	records: AnalyticsDataPoint[];
	timeRange?: TimeRange;
	nodes: string[];
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
	/** How to fold points when the window is wider than the render lattice.
	 *  Defaults to 'mean', correct for a per-second rate (request-rate): equal
	 *  time buckets, so the coarse rate is the mean of the fine rates. A ratio
	 *  metric would pass 'count-weighted-mean' to stay Σ-correct. */
	downsampleAggregator?: Aggregator;
}

export function PerPathRateRenderer({
	records,
	timeRange,
	nodes,
	viewMode = 'per-node',
	yAxis,
	thresholds,
	compute,
	downsampleAggregator,
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
		() => {
			const raw = compute(records, { perNode, selectedPath: effective || null });
			// These derived metrics build series from raw columns and reach the
			// chart through this custom Renderer, so they skip runPipeline's
			// downsample pass and MetricRenderer's derived-fold. Fold here or a
			// 7 d / 30 d view stays at one point per 60 s beside panels capped at
			// ~180 (#1588). No window (standalone/test) → leave raw.
			if (!timeRange) { return raw; }
			return downsampleDerivedSeriesData(
				raw,
				targetBucketMs(timeRange.endTime - timeRange.startTime, { expanded: !!fillParent }),
				downsampleAggregator,
			);
		},
		[records, perNode, effective, compute, timeRange, fillParent, downsampleAggregator],
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
