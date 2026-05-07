import { TrafficByTypeRenderer } from '../primitives/TrafficByTypeRenderer.tsx';
import type { AnalyticsDataPoint, MetricSpec, TimeRange } from '../types/analytics.ts';

// Schema note: Harper emits database-size records with the per-database
// byte total on the `size` column (analytics-viz's original spec said
// `used`, which is stale relative to current Harper builds). Each row
// also carries a `transactionLog` byte counter consumed by the
// transaction-log-growth derived panel.
//
// Rendering: stacked-area with a multi-select chip row above the chart
// (database names) and a node legend below — the same dual-legend
// pattern Traffic-tab panels use. Operator can solo / Ctrl-toggle
// databases or nodes; the chart updates live as records are filtered
// pre-pipeline.
export const databaseSizeSpec: MetricSpec = {
	title: 'Database size',
	description: 'Per-database size in bytes — chips solo / Ctrl-toggle databases; node legend filters by node.',
	tab: 'storage',
	primaryDimension: 'database',
	series: {
		kind: 'groupBy',
		dimension: 'database',
		field: { field: 'size', label: 'size (bytes)' },
	},
	timestamp: 'id',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'last', crossNode: 'sum' },
	primitive: 'stacked-area',
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

/** Default `viewMode='aggregate'` so the stack reads "cluster total
 *  broken out by database" — that's the operator's first question for
 *  storage. Setting viewMode='per-node' on the panel toggles the stack
 *  to "per-database total broken out by node" via TrafficByTypeRenderer's
 *  built-in remap. */
export function DatabaseSizeRenderer(props: RendererProps) {
	return (
		<TrafficByTypeRenderer
			spec={databaseSizeSpec}
			typeField="database"
			{...props}
			viewMode={props.viewMode ?? 'aggregate'}
		/>
	);
}
