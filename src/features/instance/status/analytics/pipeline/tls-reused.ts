import type { MetricSpec } from '../types/analytics.ts';

export const tlsReusedSpec: MetricSpec = {
	title: 'TLS session reuse ratio',
	description: 'Fraction of TLS handshakes resumed via session ticket — higher is better.',
	tab: 'traffic',
	primaryDimension: 'node',
	series: {
		kind: 'groupBy',
		dimension: 'node',
		field: { field: 'ratio', label: 'reuse ratio', transform: { kind: 'ratio' } },
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'count-weighted-mean', crossNode: 'count-weighted-mean' },
	confidence: { greyBelow: 20, suppressBelow: 50 },
	primitive: 'line',
	yAxis: { unit: '', formatter: 'percent' },
	thresholds: [
		{ value: 0.5, label: '50% reuse target', direction: 'below-is-bad', minCount: 50 },
	],
};
