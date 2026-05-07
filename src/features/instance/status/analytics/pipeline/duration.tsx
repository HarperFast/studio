import { DimensionSelectorRenderer } from '../primitives/DimensionSelectorRenderer.tsx';
import type { AnalyticsDataPoint, MetricSpec, TimeRange } from '../types/analytics.ts';
import { QUANTILE_DEFAULT, QUANTILE_FIELDS } from './quantileFields.ts';

export const durationSpec: MetricSpec = {
	title: 'Request duration (p95)',
	description: 'Per-path request duration p95 (count-weighted-mean) — top 10 paths + Other bucket.',
	tab: 'requests',
	primaryDimension: 'path',
	subDimension: 'method',
	series: {
		kind: 'groupBy',
		dimension: 'path',
		field: { field: 'p95', label: 'p95 duration (ms)' },
		topN: 10,
		otherBucket: true,
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'count-weighted-mean', crossNode: 'count-weighted-mean' },
	confidence: { field: 'count', greyBelow: 40, suppressBelow: 100 },
	primitive: 'line',
	yAxis: { unit: '', formatter: 'ms' },
	quantileSelector: { fields: QUANTILE_FIELDS, default: QUANTILE_DEFAULT },
};

interface RendererProps {
	records: AnalyticsDataPoint[];
	timeRange: TimeRange;
	nodes: string[];
	theme: 'light' | 'dark';
	viewMode?: 'per-node' | 'aggregate';
}

export function DurationRenderer(props: RendererProps) {
	return <DimensionSelectorRenderer spec={durationSpec} {...props} ariaLabel="Path" />;
}
