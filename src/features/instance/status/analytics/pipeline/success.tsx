import { DimensionSelectorRenderer } from '../primitives/DimensionSelectorRenderer.tsx';
import type { AnalyticsDataPoint, MetricSpec, TimeRange } from '../types/analytics.ts';

export const successSpec: MetricSpec = {
	title: 'Request success rate',
	description: 'Per-path success ratio (count-weighted-mean) — alert when ≥0.001 errors and Σcount ≥1000.',
	tab: 'requests',
	primaryDimension: 'path',
	subDimension: 'method',
	series: {
		kind: 'groupBy',
		dimension: 'path',
		// Harper omits `ratio` on operation/fastify-route records (~34% of the
		// fixture) but always emits total + count. Compute total/count via
		// FieldExpr instead of reading the optional `ratio` field directly so
		// those records aren't silently dropped — without this, the displayed
		// success-rate is biased toward whichever request types Harper happens
		// to ratio-tag. fieldExpr.ts returns null for count === 0 (div-by-zero
		// guard), so 0-count buckets still gap correctly.
		field: {
			field: {
				kind: 'op',
				op: '/',
				left: { kind: 'ref', field: 'total' },
				right: { kind: 'ref', field: 'count' },
			},
			label: 'success ratio',
		},
		topN: 10,
		otherBucket: true,
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'count-weighted-mean', crossNode: 'count-weighted-mean' },
	confidence: { field: 'count', greyBelow: 40, suppressBelow: 100 },
	primitive: 'line',
	yAxis: { unit: '', formatter: 'percent' },
	thresholds: [
		{ value: 0.999, label: '99.9% SLO', direction: 'below-is-bad', minCount: 1000 },
	],
};

interface RendererProps {
	records: AnalyticsDataPoint[];
	timeRange: TimeRange;
	nodes: string[];
	theme: 'light' | 'dark';
	viewMode?: 'per-node' | 'aggregate';
}

export function SuccessRenderer(props: RendererProps) {
	return <DimensionSelectorRenderer spec={successSpec} {...props} ariaLabel="Path" />;
}
