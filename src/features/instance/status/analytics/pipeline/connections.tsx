import { TrafficByTypeRenderer } from '../primitives/TrafficByTypeRenderer.tsx';
import type { AnalyticsDataPoint, MetricSpec, TimeRange } from '../types/analytics.ts';

// Schema note: this Harper build splits "active sessions" across two
// metrics — `mqtt-connections` and `ws-connections` — each carrying a
// `connections` field with the active-session snapshot. The unified
// `connections` metric on this build is event-based (connect/disconnect)
// not snapshot-based, so it isn't a substitute. The dashboard panel
// (rendered by ConnectionsPanel in TrafficTab) fetches both metrics,
// tags each row with a synthesized `type` field, and feeds the merged
// stream into the renderer below.
export const connectionsSpec: MetricSpec = {
	title: 'Connections',
	description: 'Active sessions by type — chips solo / Ctrl-toggle. viewMode flips type/node stack.',
	tab: 'traffic',
	primaryDimension: 'node',
	subDimension: 'type',
	series: {
		kind: 'groupBy',
		dimension: 'type',
		field: {
			field: 'connections',
			label: 'connections',
			aggregator: { temporal: 'max', crossNode: 'sum' },
		},
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'max', crossNode: 'sum' },
	primitive: 'stacked-area',
	yAxis: { unit: '', formatter: 'count-si' },
};

interface RendererProps {
	records: AnalyticsDataPoint[];
	timeRange: TimeRange;
	nodes: string[];
	theme: 'light' | 'dark';
	viewMode?: 'per-node' | 'aggregate';
	fillParent?: boolean;
}

export function ConnectionsRenderer(props: RendererProps) {
	return <TrafficByTypeRenderer spec={connectionsSpec} typeField="type" {...props} />;
}
