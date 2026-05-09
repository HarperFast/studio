import type { AnalyticsDataPoint, DerivedMetricSpec, Series, SeriesData, TimeRange } from '../../types/analytics.ts';

/**
 * Derived metric: per-database transaction-log write rate (bytes/sec).
 *
 * Harper's `database-size` metric carries a `transactionLog` byte counter
 * that is monotonically increasing — it's the cumulative log volume per
 * database. The cumulative number isn't useful on a chart by itself
 * (always rising); the *delta* between consecutive samples per database,
 * normalized by the elapsed time, gives an actionable write-throughput
 * line that mirrors what replication is moving.
 *
 * Implementation:
 *   1. Bucket records by database, then by node (cumulative counters
 *      are per-node, so deltas have to be computed within a node).
 *   2. Sort each node's series by time, walk forward computing
 *      `(logBytes[i] - logBytes[i-1]) / (time[i] - time[i-1]) * 1000`
 *      to get bytes/sec.
 *   3. Sum the resulting per-node rates per `(database, time)` bucket
 *      so cluster-wide growth folds into one line per database.
 *
 * Negative or non-finite deltas (counter resets, restarts) are skipped —
 * they'd otherwise put a downward spike on the chart. The first sample
 * per node has no predecessor so it produces no point.
 */
export function recomputeTransactionLogGrowth(
	records: AnalyticsDataPoint[],
	_window: TimeRange,
	_nodes: string[],
): SeriesData {
	const byDatabase = new Map<string, Map<string, Array<{ time: number; logBytes: number }>>>();
	for (const r of records) {
		const database = typeof r.database === 'string' ? r.database : null;
		if (!database) { continue; }
		const time = typeof r.id === 'number'
			? r.id
			: typeof r.time === 'number'
			? r.time
			: null;
		if (time === null) { continue; }
		const node = typeof r.node === 'string' ? r.node : '_no_node';
		const logBytes = typeof r.transactionLog === 'number' && Number.isFinite(r.transactionLog)
			? r.transactionLog
			: null;
		if (logBytes === null) { continue; }
		let perNode = byDatabase.get(database);
		if (!perNode) {
			perNode = new Map();
			byDatabase.set(database, perNode);
		}
		let samples = perNode.get(node);
		if (!samples) {
			samples = [];
			perNode.set(node, samples);
		}
		samples.push({ time, logBytes });
	}

	// Snap the rate's output timestamp to a 60s bucket *only* when rolling per-node
	// rates into the cluster sum, so two nodes sampling around the same minute
	// boundary (e.g. 1:59:43 + 2:00:03) fold into one point instead of staggering
	// across two. Deltas themselves use the raw per-node intervals so accuracy
	// is preserved. Sub-bucket sample spacing (test fixtures, in-development
	// Harper builds) bypasses snapping so adjacent samples don't collapse to
	// the same x and lose their dt.
	const OUTPUT_BUCKET_MS = 60_000;
	const series: Series[] = [];
	for (const [database, perNode] of byDatabase.entries()) {
		const ratesByTime = new Map<number, number>();
		for (const samples of perNode.values()) {
			samples.sort((a, b) => a.time - b.time);
			for (let i = 1; i < samples.length; i++) {
				const prev = samples[i - 1];
				const cur = samples[i];
				const dtMs = cur.time - prev.time;
				if (dtMs <= 0) { continue; }
				const dBytes = cur.logBytes - prev.logBytes;
				if (!Number.isFinite(dBytes) || dBytes < 0) { continue; }
				const rate = (dBytes * 1000) / dtMs;
				if (!Number.isFinite(rate)) { continue; }
				const bucketed = dtMs >= OUTPUT_BUCKET_MS
					? Math.round(cur.time / OUTPUT_BUCKET_MS) * OUTPUT_BUCKET_MS
					: cur.time;
				ratesByTime.set(bucketed, (ratesByTime.get(bucketed) ?? 0) + rate);
			}
		}
		const sortedTimes = [...ratesByTime.keys()].sort((a, b) => a - b);
		const points = sortedTimes.map((t) => ({ x: t, y: ratesByTime.get(t)! }));
		series.push({ key: database, label: database, points });
	}

	return { series };
}

export const transactionLogGrowthDerived: DerivedMetricSpec = {
	id: 'transaction-log-growth',
	title: 'Transaction log growth',
	subtitle:
		'Per-database transaction-log write rate (bytes/sec) — derived from `transactionLog` deltas in the database-size response.',
	tab: 'storage',
	sourceMetric: 'database-size',
	recompute: recomputeTransactionLogGrowth,
	primitive: 'line',
	yAxis: { unit: '/s', formatter: 'bytes-si' },
};
