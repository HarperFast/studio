import type { MetricSpec } from '../types/analytics.ts';

export const utilizationSpec: MetricSpec = {
	title: 'Cluster utilization',
	description: 'Active / (active + idle) per node — count-weighted-mean across time.',
	tab: 'health',
	primaryDimension: 'node',
	series: {
		kind: 'groupBy',
		dimension: 'node',
		field: { field: 'utilization', label: 'utilization', transform: { kind: 'ratio' } },
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'mean', crossNode: 'max' },
	confidence: { greyBelow: 40, suppressBelow: 100 },
	primitive: 'line',
	yAxis: { unit: '', formatter: 'percent' },
};
