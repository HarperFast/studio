import { DimensionSelectorRenderer } from '../primitives/DimensionSelectorRenderer.tsx';
import type { AnalyticsDataPoint, MetricSpec, TimeRange } from '../types/analytics.ts';

// Schema (per Harper get_analytics metric: 'cache-hit'):
//   { time, node, path, period, count, total, ratio }
//
// `ratio` is precomputed by Harper as `total / count` (hits / lookups). We
// plot it directly with a count-weighted-mean cross-bucket so paths with
// many lookups dominate the cluster line — a path with one lookup and a
// 100% hit shouldn't drag the average up.
export const cacheHitSpec: MetricSpec = {
	title: 'Cache hit rate',
	description: 'Per-path cache-hit ratio (count-weighted-mean) — top 10 paths + Other.',
	tab: 'requests',
	primaryDimension: 'path',
	series: {
		kind: 'groupBy',
		dimension: 'path',
		field: { field: 'ratio', label: 'hit ratio' },
		topN: 10,
		otherBucket: true,
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'count-weighted-mean', crossNode: 'count-weighted-mean' },
	// Same gating as duration / transfer — sample-thin paths grey out
	// rather than dragging the chart with one-off readings.
	confidence: { field: 'count', greyBelow: 40, suppressBelow: 100 },
	primitive: 'line',
	yAxis: { unit: '', formatter: 'percent', domain: [0, 1] },
};

interface RendererProps {
	records: AnalyticsDataPoint[];
	timeRange: TimeRange;
	nodes: string[];
	theme: 'light' | 'dark';
	viewMode?: 'per-node' | 'aggregate';
}

export function CacheHitRenderer(props: RendererProps) {
	return <DimensionSelectorRenderer spec={cacheHitSpec} {...props} ariaLabel="Path" />;
}
