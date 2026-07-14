import { describe, expect, it } from 'vitest';
import { wrapperMetrics } from '../../pipeline/wrapperMetrics';
const cacheHitSpec = wrapperMetrics['cache-hit'].spec;
import { runPipeline } from '../../pipeline/pipeline';
import type { AnalyticsDataPoint } from '../../types/analytics';

// Synthetic rows shaped like the real Harper response:
//   { time, node, path, period, count, total, ratio }
// `ratio` is `total / count` — Harper precomputes it; we plot it directly.
const records: AnalyticsDataPoint[] = [
	{ time: 100, node: 'n1', path: '/api/users', period: 60_000, count: 1000, total: 800, ratio: 0.8 },
	{ time: 100, node: 'n1', path: '/api/orders', period: 60_000, count: 500, total: 100, ratio: 0.2 },
	{ time: 200, node: 'n1', path: '/api/users', period: 60_000, count: 1000, total: 900, ratio: 0.9 },
	{ time: 200, node: 'n1', path: '/api/orders', period: 60_000, count: 500, total: 200, ratio: 0.4 },
] as unknown as AnalyticsDataPoint[];

describe('cache-hit pipeline', () => {
	it('emits one series per path (groupBy on path)', () => {
		const out = runPipeline(cacheHitSpec, records, { startTime: 0, endTime: 1000 }, []);
		const keys = out.series.map((s) => s.key).sort();
		expect(keys).toEqual(['/api/orders', '/api/users']);
	});

	it('plots ratio in [0,1] for each bucket', () => {
		const out = runPipeline(cacheHitSpec, records, { startTime: 0, endTime: 1000 }, []);
		for (const s of out.series) {
			for (const p of s.points) {
				if (p.y === null) { continue; }
				expect(p.y).toBeGreaterThanOrEqual(0);
				expect(p.y).toBeLessThanOrEqual(1);
			}
		}
	});

	it('users path shows the higher hit ratio relative to orders', () => {
		const out = runPipeline(cacheHitSpec, records, { startTime: 0, endTime: 1000 }, []);
		const users = out.series.find((s) => s.key === '/api/users')!;
		const orders = out.series.find((s) => s.key === '/api/orders')!;
		const usersAvg = users.points.reduce((a, p) => a + (p.y ?? 0), 0) / users.points.length;
		const ordersAvg = orders.points.reduce((a, p) => a + (p.y ?? 0), 0) / orders.points.length;
		expect(usersAvg).toBeGreaterThan(ordersAvg);
	});
});
