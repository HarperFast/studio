import type { AnalyticsDataPoint, DerivedMetricSpec, Series, SeriesData, TimeRange } from '../../types/analytics';

/**
 * Derived: per-(path, time) error rate computed from raw `count` and `total`
 * source columns. Σ-arithmetic: errorRate = 1 − Σtotal/Σcount.
 *
 * NOT mean(1 − ratio) — that's the canonical "ratio-of-ratios" bug the spec
 * calls out (line 518). Two records with [{count: 1000, total: 990},
 * {count: 10, total: 1}] should yield ≈0.0188 (Σ-correct), not 0.455
 * (mean-of-ratios).
 */
export function recomputeErrorRate(
	records: AnalyticsDataPoint[],
	_window: TimeRange,
	_nodes: string[],
): SeriesData {
	const buckets = new Map<string, Map<number, { sumCount: number; sumTotal: number }>>();
	for (const r of records) {
		const path = typeof r.path === 'string' ? r.path : null;
		if (!path) { continue; }
		if (typeof r.time !== 'number' || !Number.isFinite(r.time)) { continue; }
		const count = typeof r.count === 'number' && Number.isFinite(r.count) ? r.count : 0;
		const total = typeof r.total === 'number' && Number.isFinite(r.total) ? r.total : 0;
		let perTime = buckets.get(path);
		if (!perTime) {
			perTime = new Map();
			buckets.set(path, perTime);
		}
		let entry = perTime.get(r.time);
		if (!entry) {
			entry = { sumCount: 0, sumTotal: 0 };
			perTime.set(r.time, entry);
		}
		entry.sumCount += count;
		entry.sumTotal += total;
	}

	const series: Series[] = [...buckets.entries()].map(([path, perTime]) => {
		const sortedTimes = [...perTime.keys()].sort((a, b) => a - b);
		const points = sortedTimes.map((t) => {
			const e = perTime.get(t)!;
			const y = e.sumCount === 0 ? null : 1 - (e.sumTotal / e.sumCount);
			return { x: t, y, count: e.sumCount };
		});
		return { key: path, label: path, points };
	});

	return {
		series,
		thresholds: [
			{ value: 0.001, label: '0.1% error SLO', direction: 'above-is-bad', minCount: 1000 },
		],
	};
}

export const errorRateDerived: DerivedMetricSpec = {
	id: 'error-rate',
	title: 'Error rate (≥1000 req)',
	subtitle: 'errored-request fraction — 1 − Σtotal/Σcount',
	tab: 'requests',
	sourceMetric: 'success',
	recompute: recomputeErrorRate,
	// Wide-window downsampling folds several fine buckets into one; a ratio must
	// be recombined Σ-correctly, not averaged. Each point carries count=sumCount,
	// and ratio·count = count − total = the bucket's error count, so
	// count-weighted-mean = Σerrors/Σcount = 1 − Σtotal/Σcount — the same
	// Σ-arithmetic recomputeErrorRate does per bucket. Plain 'mean' here would be
	// the ratio-of-ratios bug this file's docstring warns against (a low-traffic,
	// high-error bucket weighted equally with a high-traffic, low-error one).
	// error-rate has no custom Renderer, so this drives both the on-screen fold
	// (MetricRenderer) and the CSV fold (csvExport).
	downsampleAggregator: 'count-weighted-mean',
	primitive: 'line',
	yAxis: { unit: '', formatter: 'percent' },
	// Threshold lives on the SeriesData returned by `recomputeErrorRate` — the
	// LineChart primitive reads thresholds from rendered SeriesData, not from
	// the DerivedMetricSpec entry. Single source of truth.
};
