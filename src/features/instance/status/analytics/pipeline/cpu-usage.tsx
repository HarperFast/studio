import { DimensionSelectorRenderer } from '../primitives/DimensionSelectorRenderer.tsx';
import type { AnalyticsDataPoint, MetricSpec, TimeRange } from '../types/analytics.ts';
import { QUANTILE_DEFAULT, QUANTILE_FIELDS } from './quantileFields.ts';

// Single-chart with chip selector (path: harper/user) + standard quantile
// selector (p1..p999, default p95). Replaces the prior 3-panel
// small-multiples view that locked operators to p50/p95/p99 only.
export const cpuUsageSpec: MetricSpec = {
	title: 'CPU — by scope (harper vs user)',
	description:
		'Per-path CPU utilization (count-weighted-mean) — chip selector picks scope; quantile selector picks percentile.',
	tab: 'health',
	primaryDimension: 'path',
	series: {
		kind: 'groupBy',
		dimension: 'path',
		field: { field: 'p95', label: 'CPU %' },
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'count-weighted-mean', crossNode: 'count-weighted-mean' },
	confidence: { field: 'count', greyBelow: 40, suppressBelow: 100 },
	primitive: 'line',
	yAxis: { unit: '', formatter: 'percent' },
	quantileSelector: { fields: QUANTILE_FIELDS, default: QUANTILE_DEFAULT },
};

interface RendererProps {
	records: AnalyticsDataPoint[];
	timeRange: TimeRange;
	nodes: string[];
	theme: 'light' | 'dark';
	viewMode?: 'per-node' | 'aggregate';
}

export function CpuUsageRenderer(props: RendererProps) {
	return <DimensionSelectorRenderer spec={cpuUsageSpec} {...props} ariaLabel="Scope" />;
}
