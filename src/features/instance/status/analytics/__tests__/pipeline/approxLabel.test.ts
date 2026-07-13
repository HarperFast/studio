import { describe, expect, it } from 'vitest';
import { isApproxAggregator, labelWithApprox } from '../../pipeline/approxLabel';

describe('approxLabel', () => {
	it('appends " (approx)" when aggregator is count-weighted-mean', () => {
		expect(labelWithApprox('p95', 'count-weighted-mean')).toBe('p95 (approx)');
	});
	it('passthrough for other aggregators', () => {
		expect(labelWithApprox('total bytes/sec', 'sum')).toBe('total bytes/sec');
		expect(labelWithApprox('max concurrency', 'max')).toBe('max concurrency');
	});
	it('idempotent — does not double-suffix', () => {
		expect(labelWithApprox('p95 (approx)', 'count-weighted-mean')).toBe('p95 (approx)');
	});
	it('isApproxAggregator flags only count-weighted-mean', () => {
		expect(isApproxAggregator('count-weighted-mean')).toBe(true);
		expect(isApproxAggregator('sum')).toBe(false);
		expect(isApproxAggregator('p95')).toBe(false);
	});
});
