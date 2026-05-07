import { TrafficByTypeRenderer } from '../primitives/TrafficByTypeRenderer.tsx';
import type { AnalyticsDataPoint, MetricSpec, TimeRange } from '../types/analytics.ts';

export const bytesReceivedSpec: MetricSpec = {
	title: 'Bytes received by type',
	description: 'Inbound byte rate (count × mean) — cluster total. Type chips solo / Ctrl-toggle.',
	tab: 'traffic',
	primaryDimension: 'node',
	subDimension: 'type',
	series: {
		kind: 'groupBy',
		dimension: 'type',
		field: {
			field: {
				kind: 'op',
				op: '*',
				left: { kind: 'ref', field: 'count' },
				right: { kind: 'ref', field: 'mean' },
			},
			label: 'bytes/sec',
			transform: { kind: 'rate' },
		},
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'sum', crossNode: 'sum' },
	primitive: 'stacked-area',
	yAxis: { unit: '/s', formatter: 'bytes-si' },
};

interface RendererProps {
	records: AnalyticsDataPoint[];
	timeRange: TimeRange;
	nodes: string[];
	theme: 'light' | 'dark';
	viewMode?: 'per-node' | 'aggregate';
}

export function BytesReceivedRenderer(props: RendererProps) {
	return <TrafficByTypeRenderer spec={bytesReceivedSpec} typeField="type" {...props} />;
}
