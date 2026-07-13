import { useMemo, useState } from 'react';
import { NodeLegend } from '../charts/NodeLegend.tsx';
import { useNodeFilteredSeries } from '../hooks/useNodeFilteredSeries.ts';
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

interface Preprocessed {
	records: AnalyticsDataPoint[];
	/** Composite chip value → its source dimensions. The composite string is
	 *  display-only; recovering {path, method} from it by splitting on ' · '
	 *  would corrupt values that contain the separator, so carry the parts. */
	dimParts: Map<string, Record<string, string>>;
}

function preprocess(records: AnalyticsDataPoint[]): Preprocessed {
	const out: AnalyticsDataPoint[] = [];
	const dimParts = new Map<string, Record<string, string>>();
	for (const r of records) {
		const path = (r as any).path;
		const method = (r as any).method;
		const key = compositeKey(path, method);
		if (key === null) { continue; }
		if (!dimParts.has(key)) {
			dimParts.set(key, { path: String(path), method: String(method) });
		}
		const total = (r as any).total;
		const count = (r as any).count;
		const nullGap = total === 0 && typeof count === 'number' && count > 0;
		out.push({
			...r,
			[COMPOSITE_FIELD]: key,
			ratio: nullGap ? null : (r as any).ratio,
		} as any);
	}
	return { records: out, dimParts };
}

export function ConnectionRenderer(
	{ records, timeRange, nodes, theme, viewMode = 'per-node', fillParent }: RendererProps,
) {
	const perNode = viewMode === 'per-node';
	const { records: processed, dimParts } = useMemo(() => preprocess(records), [records]);

	const fullData = useMemo<SeriesData>(
		() => runPipeline(connectionSpec, processed, timeRange, nodes, { perNode, snapToPeriod: true }),
		[processed, timeRange, nodes, perNode],
	);

	// The chip selector picks one composite (pathMethod) dimension value;
	// per-node series carry it on the structured `dim` field.
	const selectable = useMemo(() => {
		const seen = new Set<string>();
		for (const s of fullData.series) {
			seen.add(s.dim ?? s.key);
		}
		return [...seen];
	}, [fullData.series]);
	const [selected, setSelected] = useState<string>(() => selectable[0] ?? '');
	const effectiveSelected = selectable.includes(selected) ? selected : (selectable[0] ?? '');

	const selectedDims = dimParts.get(effectiveSelected) ?? null;

	const dimFilteredData: SeriesData = useMemo(() => {
		function thresholdMatches(t: Threshold): boolean {
			// Scope-less thresholds are global — keep them even when the
			// selected dim has no dimParts entry (e.g. an Other bucket).
			if (!t.scope) { return true; }
			if (!selectedDims) { return false; }
			for (const [dim, want] of Object.entries(t.scope)) {
				if (selectedDims[dim] !== want) { return false; }
			}
			return true;
		}
		return {
			...fullData,
			series: fullData.series.filter((s) => (s.dim ?? s.key) === effectiveSelected),
			thresholds: (fullData.thresholds ?? []).filter(thresholdMatches),
		};
	}, [fullData, effectiveSelected, selectedDims]);

	const { data: filteredData, isActive, handleLegendClick } = useNodeFilteredSeries(dimFilteredData, nodes);

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
