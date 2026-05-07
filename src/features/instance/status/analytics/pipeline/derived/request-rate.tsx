import { PerPathRateRenderer } from '../../primitives/PerPathRateRenderer.tsx';
import type { AnalyticsDataPoint, DerivedMetricSpec, Series, SeriesData, TimeRange } from '../../types/analytics.ts';

/**
 * Derived: request-rate per (path, time) bucket. Reads raw `count` and `period`
 * columns directly — does NOT delegate to runPipeline / FieldSpec aggregator.
 *
 * Per-bucket rate = Σcount / (period/1000). Across nodes, rates add (sum), so
 * we accumulate `sumCount` over (path, time) across all (method, type, node)
 * records that share the bucket.
 */
export function recomputeRequestRate(
	records: AnalyticsDataPoint[],
	_window: TimeRange,
	_nodes: string[],
): SeriesData {
	const buckets = new Map<string, Map<number, { sumCount: number; period: number }>>();
	for (const r of records) {
		const path = typeof r.path === 'string' ? r.path : null;
		if (!path) { continue; }
		if (typeof r.time !== 'number' || !Number.isFinite(r.time)) { continue; }
		const count = typeof r.count === 'number' && Number.isFinite(r.count) ? r.count : 0;
		const period = typeof r.period === 'number' && r.period > 0 ? r.period : 60000;
		let perTime = buckets.get(path);
		if (!perTime) {
			perTime = new Map();
			buckets.set(path, perTime);
		}
		let entry = perTime.get(r.time);
		if (!entry) {
			entry = { sumCount: 0, period };
			perTime.set(r.time, entry);
		}
		entry.sumCount += count;
		// Period assumed identical per-(path, time); first record wins.
	}

	const series: Series[] = [...buckets.entries()].map(([path, perTime]) => {
		const sortedTimes = [...perTime.keys()].sort((a, b) => a - b);
		const points = sortedTimes.map((t) => {
			const e = perTime.get(t)!;
			const periodSec = e.period / 1000;
			const y = periodSec > 0 ? e.sumCount / periodSec : null;
			return { x: t, y, count: e.sumCount };
		});
		return { key: path, label: path, points };
	});
	return { series };
}

/** Per-node + chip-selectable variant. Selected path → one series per
 *  node showing that path's rate. No selection → one series per path
 *  (cluster aggregate; the original behavior). */
function computeForRenderer(
	records: AnalyticsDataPoint[],
	{ perNode, selectedPath }: { perNode: boolean; selectedPath: string | null },
): SeriesData {
	if (perNode && selectedPath) {
		// Bucket by (node, time) for the selected path only.
		const buckets = new Map<string, Map<number, { sumCount: number; period: number }>>();
		for (const r of records) {
			if (r.path !== selectedPath) { continue; }
			if (typeof r.time !== 'number' || !Number.isFinite(r.time)) { continue; }
			const node = typeof r.node === 'string' ? r.node : '_no_node';
			const count = typeof r.count === 'number' && Number.isFinite(r.count) ? r.count : 0;
			const period = typeof r.period === 'number' && r.period > 0 ? r.period : 60000;
			let perTime = buckets.get(node);
			if (!perTime) {
				perTime = new Map();
				buckets.set(node, perTime);
			}
			let entry = perTime.get(r.time);
			if (!entry) {
				entry = { sumCount: 0, period };
				perTime.set(r.time, entry);
			}
			entry.sumCount += count;
		}
		const series: Series[] = [...buckets.entries()].map(([node, perTime]) => {
			const sortedTimes = [...perTime.keys()].sort((a, b) => a - b);
			const points = sortedTimes.map((t) => {
				const e = perTime.get(t)!;
				const periodSec = e.period / 1000;
				const y = periodSec > 0 ? e.sumCount / periodSec : null;
				return { x: t, y, count: e.sumCount };
			});
			return { key: node, label: node, points };
		});
		return { series };
	}

	// Aggregate path: filter to selected (or use all), produce per-path
	// series (the recomputeRequestRate behavior).
	const filtered = selectedPath
		? records.filter((r) => r.path === selectedPath)
		: records;
	return recomputeRequestRate(filtered, { startTime: 0, endTime: Number.MAX_SAFE_INTEGER }, []);
}

export const requestRateDerived: DerivedMetricSpec = {
	id: 'request-rate',
	title: 'Request rate (req/s)',
	subtitle: 'Per-path req/s. Chip selects path; viewMode flips per-node lines / cluster aggregate.',
	tab: 'requests',
	sourceMetric: 'duration',
	recompute: recomputeRequestRate,
	Renderer: ({ records, timeRange, nodes, theme, viewMode }) => (
		<PerPathRateRenderer
			records={records}
			timeRange={timeRange}
			nodes={nodes}
			theme={theme}
			viewMode={viewMode}
			yAxis={{ unit: '/s', formatter: 'count-si' }}
			compute={computeForRenderer}
		/>
	),
	primitive: 'line',
	yAxis: { unit: '/s', formatter: 'count-si' },
};
