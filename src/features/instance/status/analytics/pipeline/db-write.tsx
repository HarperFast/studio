import { DimensionSelectorRenderer } from '../primitives/DimensionSelectorRenderer.tsx';
import type { AnalyticsDataPoint, MetricSpec, TimeRange } from '../types/analytics.ts';
import { QUANTILE_DEFAULT, QUANTILE_FIELDS } from './quantileFields.ts';

export const dbWriteSpec: MetricSpec = {
	title: 'DB write p95',
	description: 'Per-table DB write p95 (count-weighted-mean) — top 10 tables + Other.',
	tab: 'db-activity',
	primaryDimension: 'path',
	subDimension: 'method',
	series: {
		kind: 'groupBy',
		dimension: 'path',
		field: { field: 'p95', label: 'p95 write (ms)' },
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

export function DbWriteRenderer(props: RendererProps) {
	return <DimensionSelectorRenderer spec={dbWriteSpec} {...props} ariaLabel="Table" />;
}
