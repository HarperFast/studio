// error-rate is a ratio (1 − Σtotal/Σcount), so folding several fine buckets
// into one coarse bucket at 7 d / 30 d must recombine Σ-correctly, not average
// the per-bucket ratios. The spec pins `downsampleAggregator:
// 'count-weighted-mean'` for exactly this; these lock it against the
// ratio-of-ratios regression (#1588 review).
import { describe, expect, it } from 'vitest';
import { getPreset, targetBucketMs } from '../../context/timePresets';
import { errorRateDerived, recomputeErrorRate } from '../../pipeline/derived/error-rate';
import { downsampleDerivedSeriesData } from '../../pipeline/downsample';
import type { AnalyticsDataPoint, TimeRange } from '../../types/analytics';

const T0 = 28_333_334 * 60_000;
const WINDOW: TimeRange = { startTime: 0, endTime: Number.MAX_SAFE_INTEGER };

// Two buckets of very different request volume on one path:
//   1000 reqs, 990 ok → ratio 0.010   (10 errors)
//     10 reqs,   1 ok → ratio 0.900   (9 errors)
// Σ-correct combined error rate = 19 / 1010 ≈ 0.018812.
// Mean-of-ratios (the bug) = (0.01 + 0.9) / 2 = 0.455.
const records: AnalyticsDataPoint[] = [
	{ node: 'n1', path: '/a', time: T0, count: 1000, total: 990 },
	{ node: 'n1', path: '/a', time: T0 + 60_000, count: 10, total: 1 },
];

describe('error-rate downsample fold', () => {
	it('the spec folds with count-weighted-mean', () => {
		expect(errorRateDerived.downsampleAggregator).toBe('count-weighted-mean');
	});

	it('folds disparate-volume buckets Σ-correctly, not as a mean of ratios', () => {
		const raw = recomputeErrorRate(records, WINDOW, []);
		// 30d preset → 4h bucket, so both samples (60 s apart) fold into one.
		const target = targetBucketMs(getPreset('30d').durationMs);
		const folded = downsampleDerivedSeriesData(raw, target, errorRateDerived.downsampleAggregator);
		const points = folded.series.find((s) => s.key === '/a')!.points;
		expect(points).toHaveLength(1);
		expect(points[0].y).toBeCloseTo(19 / 1010, 6); // ≈ 0.018812, Σ-correct
		expect(points[0].y).not.toBeCloseTo(0.455, 2); // NOT mean-of-ratios
		// Folded count is the summed request volume, so confidence gating and
		// the SLO threshold's minCount still see the real traffic.
		expect(points[0].count).toBe(1010);
	});

	it('an unweighted mean fold WOULD reproduce the ratio-of-ratios bug (guard rails the choice)', () => {
		const raw = recomputeErrorRate(records, WINDOW, []);
		const target = targetBucketMs(getPreset('30d').durationMs);
		const wrong = downsampleDerivedSeriesData(raw, target, 'mean');
		expect(wrong.series.find((s) => s.key === '/a')!.points[0].y).toBeCloseTo(0.455, 3);
	});
});
