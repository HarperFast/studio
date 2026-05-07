import { describe, expect, it } from 'vitest';
import { recomputeTransactionLogGrowth } from '../../pipeline/derived/transaction-log-growth.tsx';
import type { AnalyticsDataPoint } from '../../types/analytics.ts';

const range = { startTime: 0, endTime: 10_000_000 };

describe('transaction-log-growth (derived)', () => {
	it('emits one series per database', () => {
		const records: AnalyticsDataPoint[] = [
			{ database: 'data', node: 'n1', id: 1_000, transactionLog: 100 },
			{ database: 'data', node: 'n1', id: 2_000, transactionLog: 300 },
			{ database: 'system', node: 'n1', id: 1_000, transactionLog: 50 },
			{ database: 'system', node: 'n1', id: 2_000, transactionLog: 60 },
		] as unknown as AnalyticsDataPoint[];
		const out = recomputeTransactionLogGrowth(records, range, []);
		const keys = out.series.map((s) => s.key).sort();
		expect(keys).toEqual(['data', 'system']);
	});

	it('plots delta-bytes-per-second between consecutive samples on the same node', () => {
		// data: +200 bytes over 1s → 200 B/s
		const records: AnalyticsDataPoint[] = [
			{ database: 'data', node: 'n1', id: 1_000, transactionLog: 100 },
			{ database: 'data', node: 'n1', id: 2_000, transactionLog: 300 },
		] as unknown as AnalyticsDataPoint[];
		const out = recomputeTransactionLogGrowth(records, range, []);
		const data = out.series.find((s) => s.key === 'data')!;
		expect(data.points.length).toBe(1);
		expect(data.points[0].x).toBe(2_000);
		expect(data.points[0].y).toBeCloseTo(200, 5);
	});

	it('sums per-node rates into one cluster line per database', () => {
		// Two nodes each writing 100 B over 1s → cluster rate = 200 B/s
		const records: AnalyticsDataPoint[] = [
			{ database: 'data', node: 'n1', id: 1_000, transactionLog: 0 },
			{ database: 'data', node: 'n1', id: 2_000, transactionLog: 100 },
			{ database: 'data', node: 'n2', id: 1_000, transactionLog: 0 },
			{ database: 'data', node: 'n2', id: 2_000, transactionLog: 100 },
		] as unknown as AnalyticsDataPoint[];
		const out = recomputeTransactionLogGrowth(records, range, []);
		const data = out.series.find((s) => s.key === 'data')!;
		expect(data.points[0].y).toBeCloseTo(200, 5);
	});

	it('skips counter resets (negative deltas) instead of plotting downward spikes', () => {
		const records: AnalyticsDataPoint[] = [
			{ database: 'data', node: 'n1', id: 1_000, transactionLog: 1000 },
			// Reset (e.g. node restart): counter drops back to 50.
			{ database: 'data', node: 'n1', id: 2_000, transactionLog: 50 },
			// Subsequent growth resumes.
			{ database: 'data', node: 'n1', id: 3_000, transactionLog: 100 },
		] as unknown as AnalyticsDataPoint[];
		const out = recomputeTransactionLogGrowth(records, range, []);
		const data = out.series.find((s) => s.key === 'data')!;
		// Only one point — the +50 over 1s after the reset.
		expect(data.points.length).toBe(1);
		expect(data.points[0].y).toBeCloseTo(50, 5);
	});

	it('drops rows missing transactionLog or database', () => {
		const records: AnalyticsDataPoint[] = [
			{ database: 'data', node: 'n1', id: 1_000, transactionLog: 100 },
			{ database: 'data', node: 'n1', id: 2_000 } as unknown as AnalyticsDataPoint,
			{ node: 'n1', id: 3_000, transactionLog: 200 } as unknown as AnalyticsDataPoint,
		] as unknown as AnalyticsDataPoint[];
		const out = recomputeTransactionLogGrowth(records, range, []);
		// Only one usable pair (the first record alone has no predecessor;
		// the second is missing transactionLog so can't form a delta).
		expect(out.series.length).toBeLessThanOrEqual(1);
	});

	it('returns an empty SeriesData when no records carry transactionLog', () => {
		const out = recomputeTransactionLogGrowth([], range, []);
		expect(out.series).toEqual([]);
	});
});
