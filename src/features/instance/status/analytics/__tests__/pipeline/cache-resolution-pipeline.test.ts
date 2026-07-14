import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../pipeline/pipeline';
import { wrapperMetrics } from '../../pipeline/wrapperMetrics';
import type { AnalyticsDataPoint } from '../../types/analytics';

const cacheResolutionSpec = wrapperMetrics['cache-resolution'].spec;

// Synthetic rows shaped like the real Harper response. The real schema
// carries a per-bucket count-weighted distribution for each path; the
// pipeline plots p95 by default and the user can swap quantiles via the
// chip selector that DimensionSelectorRenderer wires up.
const records: AnalyticsDataPoint[] = [
	{
		time: 100,
		node: 'n1',
		path: 'Product',
		method: null,
		type: 'success',
		period: 60_000,
		count: 500,
		mean: 0.4,
		p1: 0.1,
		p10: 0.15,
		p25: 0.2,
		median: 0.3,
		p75: 0.5,
		p90: 0.7,
		p95: 0.9,
		p99: 1.5,
		p999: 5,
	},
	{
		time: 100,
		node: 'n1',
		path: 'Cart',
		method: null,
		type: 'success',
		period: 60_000,
		count: 200,
		mean: 0.6,
		p1: 0.2,
		p10: 0.3,
		p25: 0.4,
		median: 0.5,
		p75: 0.8,
		p90: 1.2,
		p95: 1.6,
		p99: 2.5,
		p999: 9,
	},
	{
		time: 200,
		node: 'n1',
		path: 'Product',
		method: null,
		type: 'success',
		period: 60_000,
		count: 600,
		mean: 0.45,
		p1: 0.1,
		p10: 0.15,
		p25: 0.2,
		median: 0.32,
		p75: 0.55,
		p90: 0.75,
		p95: 1.0,
		p99: 1.7,
		p999: 6,
	},
] as unknown as AnalyticsDataPoint[];

describe('cache-resolution pipeline', () => {
	it('emits one series per path (groupBy on path)', () => {
		const out = runPipeline(cacheResolutionSpec, records, { startTime: 0, endTime: 1000 }, []);
		const keys = out.series.map((s) => s.key).sort();
		expect(keys).toEqual(['Cart', 'Product']);
	});

	it('plots p95 by default for each path', () => {
		const out = runPipeline(cacheResolutionSpec, records, { startTime: 0, endTime: 1000 }, []);
		const product = out.series.find((s) => s.key === 'Product')!;
		// Two Product buckets at t=100 (p95=0.9) and t=200 (p95=1.0).
		const at100 = product.points.find((p) => p.x === 100)?.y;
		const at200 = product.points.find((p) => p.x === 200)?.y;
		expect(at100).toBeCloseTo(0.9, 5);
		expect(at200).toBeCloseTo(1.0, 5);
	});

	it('Cart path has higher p95 than Product (sanity)', () => {
		const out = runPipeline(cacheResolutionSpec, records, { startTime: 0, endTime: 1000 }, []);
		const product = out.series.find((s) => s.key === 'Product')!;
		const cart = out.series.find((s) => s.key === 'Cart')!;
		const productAvg = product.points.reduce((a, p) => a + (p.y ?? 0), 0) / product.points.length;
		const cartAvg = cart.points.reduce((a, p) => a + (p.y ?? 0), 0) / cart.points.length;
		expect(cartAvg).toBeGreaterThan(productAvg);
	});
});
