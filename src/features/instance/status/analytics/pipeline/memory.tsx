import { useMemo, useState } from 'react';
import { NodeLegend } from '../charts/NodeLegend.tsx';
import { useNodeSelection } from '../hooks/useNodeSelection.ts';
import { getNodeColor } from '../lib/nodeColors.ts';
import { DimensionChipRow } from '../primitives/DimensionChipRow.tsx';
import { LineChart } from '../primitives/LineChart.tsx';
import type { AnalyticsDataPoint, FieldSpec, MetricSpec, SeriesData, TimeRange } from '../types/analytics.ts';
import { runPipeline } from './pipeline.ts';

// Field-selector pattern (cousin of DimensionSelectorRenderer): chip-row
// picks one memory field at a time and the chart shows that one with the
// full panel real estate, per-node lines, shared NodeLegend below.
// Replaces the prior 4-panel small-multiples grid that crammed each field
// into a 280×180 mini-chart with multiple competing per-node lines.
//
// Aggregator { temporal: 'last', crossNode: 'mean' } — memory is a gauge.
// `count` on memory records is THREAD count, not sample volume.

const MEMORY_FIELDS: ReadonlyArray<FieldSpec> = [
	{ field: 'heapUsed', label: 'heap used' },
	{ field: 'heapTotal', label: 'heap total' },
	{ field: 'external', label: 'external' },
	{ field: 'arrayBuffers', label: 'arrayBuffers' },
];

export const memorySpec: MetricSpec = {
	title: 'Process memory',
	description: 'Per-node V8 memory — chip selector picks the field. Default heap used.',
	tab: 'health',
	primaryDimension: 'node',
	series: { kind: 'field', fields: [...MEMORY_FIELDS] },
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'last', crossNode: 'mean' },
	primitive: 'line',
	yAxis: { unit: ' B', formatter: 'bytes-si' },
};

interface RendererProps {
	records: AnalyticsDataPoint[];
	timeRange: TimeRange;
	nodes: string[];
	theme: 'light' | 'dark';
	viewMode?: 'per-node' | 'aggregate';
	fillParent?: boolean;
}

function shortenNodeLabel(node: string): string {
	const dot = node.indexOf('.');
	return dot === -1 ? node : node.slice(0, dot);
}

const FIELD_LABELS = MEMORY_FIELDS.map((f) => f.label);

export function MemoryRenderer(
	{ records, timeRange, nodes, theme, viewMode = 'per-node', fillParent }: RendererProps,
) {
	const perNode = viewMode === 'per-node';
	const [selectedLabel, setSelectedLabel] = useState<string>(MEMORY_FIELDS[0].label);
	const effectiveLabel = FIELD_LABELS.includes(selectedLabel) ? selectedLabel : MEMORY_FIELDS[0].label;
	const selectedField = MEMORY_FIELDS.find((f) => f.label === effectiveLabel)!;

	const data = useMemo<SeriesData>(() => {
		const innerSpec: MetricSpec = {
			...memorySpec,
			series: { kind: 'field', fields: [selectedField] },
		};
		return runPipeline(innerSpec, records, timeRange, nodes, { perNode, snapToPeriod: true });
	}, [selectedField, records, timeRange, nodes, perNode]);

	const { isActive, handleLegendClick } = useNodeSelection(nodes);

	const filteredData: SeriesData = useMemo(() => ({
		...data,
		series: data.series
			.map((s) => {
				const sep = s.key.indexOf('|');
				const node = sep === -1 ? '' : s.key.slice(sep + 1);
				if (!node) { return s; }
				return { ...s, label: shortenNodeLabel(node), color: getNodeColor(node, nodes) };
			})
			.filter((s) => {
				const sep = s.key.indexOf('|');
				const node = sep === -1 ? '' : s.key.slice(sep + 1);
				return node === '' || isActive(node);
			}),
	}), [data, nodes, isActive]);

	return (
		<div className="flex h-full flex-col">
			<DimensionChipRow
				dimensionValues={FIELD_LABELS}
				selected={effectiveLabel}
				onSelect={setSelectedLabel}
				ariaLabel="Memory field"
			/>
			<div className="min-h-0 flex-1" style={{ marginTop: 8 }}>
				<LineChart
					data={filteredData}
					theme={theme}
					yAxis={memorySpec.yAxis}
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
