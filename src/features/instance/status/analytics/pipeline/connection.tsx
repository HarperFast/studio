import { useMemo, useState } from 'react';
import { NodeLegend } from '../charts/NodeLegend.tsx';
import { useNodeSelection } from '../hooks/useNodeSelection.ts';
import { getNodeColor } from '../lib/nodeColors.ts';
import { DimensionChipRow } from '../primitives/DimensionChipRow.tsx';
import { LineChart } from '../primitives/LineChart.tsx';
import type { AnalyticsDataPoint, MetricSpec, SeriesData, Threshold, TimeRange } from '../types/analytics.ts';
import { runPipeline } from './pipeline.ts';

const COMPOSITE_FIELD = 'pathMethod';
const SEPARATOR = ' · ';

export const connectionSpec: MetricSpec = {
	title: 'Connection success ratio',
	description:
		'Per-(path, method) connection ratio (count-weighted-mean). MQTT thresholds: connect ≥0.99, disconnect ≥0.2.',
	tab: 'traffic',
	primaryDimension: 'path',
	subDimension: 'method',
	series: {
		kind: 'groupBy',
		dimension: COMPOSITE_FIELD,
		field: { field: 'ratio', label: 'success ratio', transform: { kind: 'ratio' } },
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'count-weighted-mean', crossNode: 'count-weighted-mean' },
	confidence: { field: 'count', greyBelow: 100, suppressBelow: 500 },
	primitive: 'line',
	yAxis: { unit: '', formatter: 'percent' },
	thresholds: [
		{
			value: 0.99,
			label: 'connect',
			direction: 'below-is-bad',
			minCount: 1000,
			scope: { path: 'mqtt', method: 'connect' },
		},
		{
			value: 0.20,
			label: 'disconnect',
			direction: 'below-is-bad',
			minCount: 500,
			scope: { path: 'mqtt', method: 'disconnect' },
		},
	],
};

interface RendererProps {
	records: AnalyticsDataPoint[];
	timeRange: TimeRange;
	nodes: string[];
	theme: 'light' | 'dark';
	viewMode?: 'per-node' | 'aggregate';
	fillParent?: boolean;
}

function compositeKey(path: unknown, method: unknown): string | null {
	if (typeof path !== 'string' && typeof path !== 'number') { return null; }
	if (typeof method !== 'string' && typeof method !== 'number') { return null; }
	return `${path}${SEPARATOR}${method}`;
}

function preprocess(records: AnalyticsDataPoint[]): AnalyticsDataPoint[] {
	const out: AnalyticsDataPoint[] = [];
	for (const r of records) {
		const path = (r as any).path;
		const method = (r as any).method;
		const key = compositeKey(path, method);
		if (key === null) { continue; }
		const total = (r as any).total;
		const count = (r as any).count;
		const nullGap = total === 0 && typeof count === 'number' && count > 0;
		out.push({
			...r,
			[COMPOSITE_FIELD]: key,
			ratio: nullGap ? null : (r as any).ratio,
		} as any);
	}
	return out;
}

function shortenNodeLabel(node: string): string {
	const dot = node.indexOf('.');
	return dot === -1 ? node : node.slice(0, dot);
}

export function ConnectionRenderer(
	{ records, timeRange, nodes, theme, viewMode = 'per-node', fillParent }: RendererProps,
) {
	const perNode = viewMode === 'per-node';
	const processed = useMemo(() => preprocess(records), [records]);

	const fullData = useMemo<SeriesData>(
		() => runPipeline(connectionSpec, processed, timeRange, nodes, { perNode, snapToPeriod: true }),
		[processed, timeRange, nodes, perNode],
	);

	// Per-node series keys are `${pathMethod}|${node}`. The chip selector
	// picks one composite (pathMethod) value; filter by prefix.
	const selectable = useMemo(() => {
		const seen = new Set<string>();
		for (const s of fullData.series) {
			const sep = s.key.indexOf('|');
			seen.add(sep === -1 ? s.key : s.key.slice(0, sep));
		}
		return [...seen];
	}, [fullData.series]);
	const [selected, setSelected] = useState<string>(() => selectable[0] ?? '');
	const effectiveSelected = selectable.includes(selected) ? selected : (selectable[0] ?? '');

	const selectedDims = useMemo(() => {
		if (!effectiveSelected) { return null; }
		const [path, method] = effectiveSelected.split(SEPARATOR);
		return { path, method } as Record<string, string>;
	}, [effectiveSelected]);

	const { isActive, handleLegendClick } = useNodeSelection(nodes);

	const filteredData: SeriesData = useMemo(() => {
		function thresholdMatches(t: Threshold): boolean {
			if (!selectedDims) { return false; }
			if (!t.scope) { return true; }
			for (const [dim, want] of Object.entries(t.scope)) {
				if (selectedDims[dim] !== want) { return false; }
			}
			return true;
		}
		const prefix = `${effectiveSelected}|`;
		const series = fullData.series
			.filter((s) => s.key === effectiveSelected || s.key.startsWith(prefix))
			.map((s) => {
				const sep = s.key.indexOf('|');
				const node = sep === -1 ? '' : s.key.slice(sep + 1);
				if (!node) { return s; }
				return {
					...s,
					label: shortenNodeLabel(node),
					color: getNodeColor(node, nodes),
				};
			})
			.filter((s) => {
				const sep = s.key.indexOf('|');
				const node = sep === -1 ? '' : s.key.slice(sep + 1);
				return node === '' || isActive(node);
			});
		return {
			...fullData,
			series,
			thresholds: (fullData.thresholds ?? []).filter(thresholdMatches),
		};
	}, [fullData, effectiveSelected, selectedDims, nodes, isActive]);

	return (
		<div className="flex h-full flex-col">
			<DimensionChipRow
				dimensionValues={selectable}
				selected={effectiveSelected}
				onSelect={setSelected}
				ariaLabel="Path · method"
			/>
			<div className="min-h-0 flex-1" style={{ marginTop: 8 }}>
				<LineChart
					data={filteredData}
					theme={theme}
					yAxis={connectionSpec.yAxis}
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
