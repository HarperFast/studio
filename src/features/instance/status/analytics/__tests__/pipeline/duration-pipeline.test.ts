import { describe, expect, it } from 'vitest';
import { labelWithApprox } from '../../pipeline/approxLabel';
import { wrapperMetrics } from '../../pipeline/wrapperMetrics';
const durationSpec = wrapperMetrics['duration'].spec;
import { runPipeline } from '../../pipeline/pipeline';
import type { AnalyticsDataPoint, TimeRange } from '../../types/analytics';

const window: TimeRange = { startTime: 0, endTime: 1_000_000 };

// 11 distinct paths → top 10 + Other bucket (when otherBucket: true).
function buildRecords(): AnalyticsDataPoint[] {
	const records: AnalyticsDataPoint[] = [];
	for (let i = 0; i < 11; i++) {
		const path = `/api/path-${i}`;
		// Decreasing volume so /api/path-10 ranks last.
		const count = (11 - i) * 100;
		records.push({
			time: 1_000,
			node: 'n1',
			path,
			method: 'GET',
			p95: 50 + i,
			count,
			period: 60_000,
		});
	}
	return records;
}

describe('duration spec — runPipeline', () => {
	it('keeps top 10 paths and rolls the rest into an Other bucket', () => {
		const out = runPipeline(durationSpec, buildRecords(), window, ['n1']);
		const keys = out.series.map((s) => s.key);
		// 10 path-* + 'Other'.
		expect(keys.length).toBe(11);
		expect(keys.includes('Other')).toBeTruthy();
		// The lowest-volume path (/api/path-10 with count=100) is rolled into Other.
		expect(!keys.includes('/api/path-10')).toBeTruthy();
		expect(keys.includes('/api/path-0')).toBeTruthy();
	});

	it('applies count-weighted-mean to p95 across multiple records', () => {
		// Two records for the same (path, time, node): weighted mean p95.
		// (count=100, p95=200) and (count=300, p95=100) → (100*200 + 300*100)/400 = 125.
		const records: AnalyticsDataPoint[] = [
			{ time: 1_000, node: 'n1', path: '/api/x', method: 'GET', p95: 200, count: 100, period: 60_000 },
			{ time: 1_000, node: 'n1', path: '/api/x', method: 'GET', p95: 100, count: 300, period: 60_000 },
		];
		const out = runPipeline(durationSpec, records, window, ['n1']);
		const x = out.series.find((s) => s.key === '/api/x')!;
		expect(x.points[0].y).toBe(125);
	});

	it('marks series approx=true since temporal/crossNode are count-weighted-mean', () => {
		const out = runPipeline(durationSpec, buildRecords(), window, ['n1']);
		for (const s of out.series) {
			expect(s.approx).toBe(true);
		}
	});

	it('approxLabel helper would label the p95 field with "(approx)" for count-weighted-mean', () => {
		const labeled = labelWithApprox('p95 duration (ms)', 'count-weighted-mean');
		expect(labeled).toMatch(/\(approx\)/);
	});
});
