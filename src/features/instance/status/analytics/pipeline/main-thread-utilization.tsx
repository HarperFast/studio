import { useMemo, useState } from 'react';
import { NodeLegend } from '../charts/NodeLegend';
import { useNodeFilteredSeries } from '../hooks/useNodeFilteredSeries';
import { DimensionChipRow } from '../primitives/DimensionChipRow';
import { LineChart } from '../primitives/LineChart';
import type { AnalyticsDataPoint, AxisSpec, FieldSpec, MetricSpec, SeriesData, TimeRange } from '../types/analytics';
import { runPipeline } from './pipeline';

// Field-selector pattern (mirrors memory.tsx). Records expose
// `active`, `idle`, and `taskQueueLatency`; we surface 4 operator-
// relevant views as chip-row options, each with its own field
// projection + y-axis formatter. The prior dual-axis design (one
// utilization line + one queue-lag line) is replaced by single-field
// focus so each option uses the full chart real estate with per-node
// breakdown.

interface FieldOption {
	key: string;
	label: string;
	field: FieldSpec['field'];
	yAxis: AxisSpec;
}

const FIELDS: ReadonlyArray<FieldOption> = [
	{
		key: 'utilization',
		label: 'Utilization',
		// active / (active + idle); FieldExpr returns null when divisor is 0.
		field: {
			kind: 'op',
			op: '/',
			left: { kind: 'ref', field: 'active' },
			right: {
				kind: 'op',
				op: '+',
				left: { kind: 'ref', field: 'active' },
				right: { kind: 'ref', field: 'idle' },
			},
		},
		yAxis: { unit: '', formatter: 'percent' },
	},
	{
		key: 'taskQueueLatency',
		label: 'Queue lag',
		field: 'taskQueueLatency',
		yAxis: { unit: '', formatter: 'ms' },
	},
	{
		key: 'active',
		label: 'Active time',
		field: 'active',
		yAxis: { unit: '', formatter: 'ms' },
	},
	{
		key: 'idle',
		label: 'Idle time',
		field: 'idle',
		yAxis: { unit: '', formatter: 'ms' },
	},
];

const FIELD_KEYS = FIELDS.map((f) => f.key);

export const mainThreadUtilizationSpec: MetricSpec = {
	title: 'Main thread utilization',
	description: 'Per-node main-thread metrics — chip selector picks utilization / queue lag / active time / idle time.',
	tab: 'health',
	primaryDimension: 'node',
	series: {
		kind: 'field',
		fields: [{ field: FIELDS[0].field, label: FIELDS[0].label }],
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'mean', crossNode: 'mean' },
	primitive: 'line',
	yAxis: FIELDS[0].yAxis,
	layout: { colSpan: 2 },
};

interface RendererProps {
	records: AnalyticsDataPoint[];
	timeRange: TimeRange;
	nodes: string[];
	viewMode?: 'per-node' | 'aggregate';
	fillParent?: boolean;
}

export function MainThreadRenderer(
	{ records, timeRange, nodes, viewMode = 'per-node', fillParent }: RendererProps,
) {
	const perNode = viewMode === 'per-node';
	const [selectedKey, setSelectedKey] = useState<string>(FIELDS[0].key);
	const effectiveKey = FIELD_KEYS.includes(selectedKey) ? selectedKey : FIELDS[0].key;
	const selected = FIELDS.find((f) => f.key === effectiveKey)!;

	const data = useMemo<SeriesData>(() => {
		const innerSpec: MetricSpec = {
			...mainThreadUtilizationSpec,
			series: { kind: 'field', fields: [{ field: selected.field, label: selected.label }] },
			yAxis: selected.yAxis,
		};
		return runPipeline(innerSpec, records, timeRange, nodes, {
			perNode,
			snapToPeriod: true,
			downsampleToWindow: true,
			expanded: !!fillParent,
		});
	}, [selected, records, timeRange, nodes, perNode, fillParent]);

	const { data: filteredData, isActive, handleLegendClick } = useNodeFilteredSeries(data, nodes);

	return (
		<div className="flex h-full flex-col">
			<DimensionChipRow
				dimensionValues={FIELD_KEYS.map((k) => FIELDS.find((f) => f.key === k)!.label)}
				selected={selected.label}
				onSelect={(label) => {
					const f = FIELDS.find((x) => x.label === label);
					if (f) { setSelectedKey(f.key); }
				}}
				ariaLabel="Main thread metric"
			/>
			<div className="min-h-0 flex-1" style={{ marginTop: 8 }}>
				<LineChart
					data={filteredData}
					yAxis={selected.yAxis}
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
