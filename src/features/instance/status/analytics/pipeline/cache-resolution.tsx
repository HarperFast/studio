import { DimensionSelectorRenderer } from '../primitives/DimensionSelectorRenderer.tsx';
import type { AnalyticsDataPoint, MetricSpec, TimeRange } from '../types/analytics.ts';
import { QUANTILE_DEFAULT, QUANTILE_FIELDS } from './quantileFields.ts';

// Schema (per Harper get_analytics metric: 'cache-resolution'):
//   { time, node, path, method, type, period, count, mean,
//     p1, p10, p25, median, p75, p90, p95, p99, p999 }
//
// Time-to-resolve a cache miss, in milliseconds. Same per-path latency
// distribution shape as `duration` and `transfer` so it shares their
// renderer pattern: line chart with a path chip selector + a quantile
// selector (p1…p999, default p95).
export const cacheResolutionSpec: MetricSpec = {
	title: 'Cache miss resolution (p95)',
	description: 'Per-path time-to-resolve a cache miss (count-weighted-mean) — top 10 paths + Other.',
	tab: 'requests',
	primaryDimension: 'path',
	subDimension: 'method',
	series: {
		kind: 'groupBy',
		dimension: 'path',
		field: { field: 'p95', label: 'p95 resolution (ms)' },
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

export function CacheResolutionRenderer(props: RendererProps) {
	return <DimensionSelectorRenderer spec={cacheResolutionSpec} {...props} ariaLabel="Path" />;
}
