import type { MetricSpec } from '../types/analytics.ts';

export const storageVolumeSpec: MetricSpec = {
	title: 'Storage volume (available)',
	description: 'Per-node disk available bytes (latest snapshot in window; mean across nodes).',
	tab: 'storage',
	primaryDimension: 'node',
	series: {
		kind: 'groupBy',
		dimension: 'node',
		field: { field: 'available', label: 'available (bytes)' },
	},
	timestamp: 'id',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'last', crossNode: 'mean' },
	primitive: 'line',
	yAxis: { unit: ' B', formatter: 'bytes-si' },
};
