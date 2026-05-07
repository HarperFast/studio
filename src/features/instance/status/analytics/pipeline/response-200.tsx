import { DimensionSelectorRenderer } from '../primitives/DimensionSelectorRenderer.tsx';
import type { AnalyticsDataPoint, MetricSpec, TimeRange } from '../types/analytics.ts';

export const response200Spec: MetricSpec = {
	title: 'HTTP 200 ratio',
	description: 'Per-path 2xx ratio (mean across nodes; count-weighted across time). Threshold 99.9%, min count 1000.',
	tab: 'requests',
	primaryDimension: 'path',
	subDimension: 'method',
	series: {
		kind: 'groupBy',
		dimension: 'path',
		// Harper omits `ratio` on operation/fastify-route records but always
		// emits total + count. Compute via FieldExpr to avoid silently
		// dropping ~34% of records. See success.tsx for the matching rationale.
		field: {
			field: {
				kind: 'op',
				op: '/',
				left: { kind: 'ref', field: 'total' },
				right: { kind: 'ref', field: 'count' },
			},
			label: '200 ratio',
		},
		topN: 10,
		otherBucket: true,
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'mean', crossNode: 'count-weighted-mean' },
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

export function Response200Renderer(props: RendererProps) {
	return <DimensionSelectorRenderer spec={response200Spec} {...props} ariaLabel="Path" />;
}
