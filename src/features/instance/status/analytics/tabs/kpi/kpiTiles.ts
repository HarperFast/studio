// Tile definitions for the Health-tab KPI stat strip. Each tile names the
// Harper metric it queries (the SAME metric string the corresponding panel
// uses, so the current-window fetch dedupes with the panel's query key) and
// a cluster-aggregate MetricSpec run through the shared runPipeline.
//
// Every vital here is up-is-bad (more CPU / memory / utilization / errors /
// latency is worse), so KpiTile colors all up-deltas destructive and all
// down-deltas green — there is no per-tile polarity flag on purpose; add one
// if a tile ever lands where up is good.

import type { ValueFormatter } from '@/lib/formatValue';
import type { MetricSpec } from '../../types/analytics';
import type { KpiCombine } from './kpiMath';

export interface KpiTileDef {
	id: string;
	label: string;
	/** Harper get_analytics metric name — must match the panel's source
	 *  metric verbatim so react-query dedupes the current-window POST. */
	metric: string;
	spec: MetricSpec;
	combine: KpiCombine;
	formatter: ValueFormatter;
}

/** Shared boilerplate for the tile specs; the interesting part of each tile
 *  is its `series` + aggregators. title/description/tab/primitive are
 *  required by MetricSpec but unused by the strip (no panel chrome). */
function tileSpec(spec: Pick<MetricSpec, 'series' | 'aggregator'> & Partial<MetricSpec>): MetricSpec {
	return {
		title: '',
		description: '',
		tab: 'health',
		primaryDimension: 'node',
		timestamp: 'time',
		bucket: { source: 'period-field', fallbackMs: 60000 },
		primitive: 'line',
		yAxis: { unit: '' },
		...spec,
	};
}

export const KPI_TILES: readonly KpiTileDef[] = [
	{
		id: 'cpu',
		label: 'CPU (p95)',
		metric: 'cpu-usage',
		// Per-scope (harper/user) count-weighted p95 — the panel's exact
		// aggregation — then the scope series are SUMMED per bucket so the
		// tile reads as total process CPU, not a mean of the two scopes.
		spec: tileSpec({
			series: {
				kind: 'groupBy',
				dimension: 'path',
				field: { field: 'p95', label: 'CPU %' },
			},
			aggregator: { temporal: 'count-weighted-mean', crossNode: 'count-weighted-mean' },
		}),
		combine: 'sum',
		formatter: 'percent',
	},
	{
		id: 'memory',
		label: 'Heap used',
		metric: 'memory',
		// Matches the Process memory panel: gauge semantics (temporal 'last'),
		// mean across nodes.
		spec: tileSpec({
			series: { kind: 'field', fields: [{ field: 'heapUsed', label: 'heap used' }] },
			aggregator: { temporal: 'last', crossNode: 'mean' },
		}),
		combine: 'mean',
		formatter: 'bytes-si',
	},
	{
		id: 'main-thread',
		label: 'Main thread',
		metric: 'main-thread-utilization',
		// active / (active + idle), mean/mean — the panel's default
		// Utilization field projection.
		spec: tileSpec({
			series: {
				kind: 'field',
				fields: [{
					field: {
						kind: 'op',
						op: '/',
						left: { kind: 'ref', field: 'active' },
						right: {
							kind: 'op',
							op: '+',
							left: { kind: 'ref', field: 'active' },
							right: { kind: 'ref', field: 'idle' },
						},
					},
					label: 'utilization',
				}],
			},
			aggregator: { temporal: 'mean', crossNode: 'mean' },
		}),
		combine: 'mean',
		formatter: 'percent',
	},
	{
		id: 'error-rate',
		label: 'Error rate',
		metric: 'success',
		// Σ-correct error rate: per-record 1 − total/count, count-weighted-mean
		// with weight = count collapses to (Σcount − Σtotal)/Σcount exactly —
		// the same arithmetic as the derived error-rate panel, NOT the
		// mean-of-ratios bug it documents.
		spec: tileSpec({
			series: {
				kind: 'field',
				fields: [{
					field: {
						kind: 'op',
						op: '-',
						left: { kind: 'const', value: 1 },
						right: {
							kind: 'op',
							op: '/',
							left: { kind: 'ref', field: 'total' },
							right: { kind: 'ref', field: 'count' },
						},
					},
					label: 'error rate',
				}],
			},
			aggregator: { temporal: 'count-weighted-mean', crossNode: 'count-weighted-mean' },
		}),
		combine: 'mean',
		formatter: 'percent',
	},
	{
		id: 'p95-duration',
		label: 'Request p95',
		metric: 'duration',
		// Count-weighted p95 across all paths and nodes — the duration
		// panel's aggregators without its top-10 path split.
		spec: tileSpec({
			series: { kind: 'field', fields: [{ field: 'p95', label: 'p95 duration (ms)' }] },
			aggregator: { temporal: 'count-weighted-mean', crossNode: 'count-weighted-mean' },
		}),
		combine: 'mean',
		formatter: 'ms',
	},
];
