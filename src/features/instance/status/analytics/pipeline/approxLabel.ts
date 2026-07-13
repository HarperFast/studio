import type { Aggregator } from '../types/analytics';

export function isApproxAggregator(op: Aggregator): boolean {
	return op === 'count-weighted-mean';
}

export function labelWithApprox(label: string, op: Aggregator): string {
	if (!isApproxAggregator(op)) { return label; }
	return label.endsWith('(approx)') ? label : `${label} (approx)`;
}
