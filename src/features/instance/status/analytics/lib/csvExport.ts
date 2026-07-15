// CSV export for Status chart data — serializes the pipeline output shapes
// (SeriesData / HeatmapData) that the chart primitives render, so the CSV a
// user downloads carries the same numbers as the chart on screen. No network
// calls: everything recomputes from the records the panel already fetched.

import { derivedRegistry } from '../pipeline/derived/index';
import { specRegistry } from '../pipeline/index';
import { runPipeline } from '../pipeline/pipeline';
import { aggregateReplicationMatrix } from '../pipeline/replication-latency';
import type { AnalyticsDataPoint, HeatmapData, MetricSpec, Series, SeriesData, TimeRange } from '../types/analytics';
import { filenameTimestamp, slugifyForFilename, triggerBlobDownload } from './chartExport';

/** Discriminated union the CSV button consumes — a panel supplies whichever
 *  shape its primitive renders. */
export type ChartCsvData =
	| { kind: 'series'; data: SeriesData }
	| { kind: 'heatmap'; data: HeatmapData };

// ─────────────────────────────────────────────────────────────────────────────
// RFC-4180 serialization
// ─────────────────────────────────────────────────────────────────────────────

/** Quote a field per RFC 4180: wrap in double quotes when it contains a
 *  comma, quote, or line break; double any embedded quotes. Cells starting
 *  with `=`, `+`, `-`, `@`, tab, or CR are prefixed with an apostrophe so
 *  spreadsheets import them as text instead of evaluating them as formulas
 *  (labels come from telemetry paths/identifiers — CSV-injection guard).
 *  Numeric cells go through csvNumber and keep their sign. */
function csvField(value: string): string {
	const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	if (/[",\r\n]/.test(neutralized)) {
		return `"${neutralized.replace(/"/g, '""')}"`;
	}
	return neutralized;
}

function csvNumber(value: number | null | undefined): string {
	return value === null || value === undefined ? '' : String(value);
}

const CRLF = '\r\n';

/** Column headers for a series list — series labels, deduped by appending
 *  the (unique) series key when two series share a label (e.g. the same
 *  dimension value on two nodes). */
function seriesHeaders(series: Series[]): string[] {
	const labelCounts = new Map<string, number>();
	for (const s of series) {
		labelCounts.set(s.label, (labelCounts.get(s.label) ?? 0) + 1);
	}
	return series.map((
		s,
	) => ((labelCounts.get(s.label) ?? 0) > 1 && s.key !== s.label ? `${s.label} (${s.key})` : s.label));
}

/** Serialize SeriesData to CSV: an ISO-8601 `timestamp` column plus one
 *  column per series (ceiling included when present). Rows are the sorted
 *  union of every series' x values; a series without a sample (or with a
 *  null gap) at a given timestamp yields an empty cell. */
export function seriesToCsv(data: SeriesData): string {
	const allSeries = data.ceiling ? [...data.series, data.ceiling] : [...data.series];
	const header = ['timestamp', ...seriesHeaders(allSeries)].map(csvField).join(',');

	const xs = new Set<number>();
	const bySeries: Map<number, number | null>[] = allSeries.map((s) => {
		const byX = new Map<number, number | null>();
		for (const p of s.points) {
			xs.add(p.x);
			byX.set(p.x, p.y);
		}
		return byX;
	});

	const rows = [...xs].sort((a, b) => a - b).map((x) => {
		const cells = [csvField(new Date(x).toISOString())];
		for (const byX of bySeries) {
			cells.push(csvNumber(byX.get(x)));
		}
		return cells.join(',');
	});

	return [header, ...rows].join(CRLF) + CRLF;
}

/** Serialize HeatmapData to CSV as `row,col,value,count` — one line per
 *  cell, in the primitive's row-major cell order. Absent values/counts are
 *  empty cells. */
export function heatmapToCsv(data: HeatmapData): string {
	const header = ['row', 'col', 'value', 'count'].join(',');
	const rows = data.cells.map((c) =>
		[csvField(c.row), csvField(c.col), csvNumber(c.value), csvNumber(c.count)].join(',')
	);
	return [header, ...rows].join(CRLF) + CRLF;
}

export function chartCsv(data: ChartCsvData): string {
	return data.kind === 'heatmap' ? heatmapToCsv(data.data) : seriesToCsv(data.data);
}

/** `<metric>-<start>-<end>.csv`, metric slugified and timestamps ISO-8601
 *  (with `:`/`.` dashed for filename safety). */
export function makeCsvFilename(metric: string, range: TimeRange): string {
	return `${slugifyForFilename(metric)}-${filenameTimestamp(range.startTime)}-${filenameTimestamp(range.endTime)}.csv`;
}

export function downloadCsv(csv: string, filename: string): void {
	triggerBlobDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric → chart-data recompute for the CSV button. Mirrors MetricRenderer's
// dispatch (primitives/MetricRenderer.tsx — keep the two in sync) minus the
// renderer-internal UI state: metrics whose custom renderer offers chip
// filters / quantile selectors export their spec's default, unfiltered view.
// ─────────────────────────────────────────────────────────────────────────────

/** The `connection` spec groups on a synthetic `pathMethod` field that only
 *  exists after ConnectionRenderer's preprocessing (pipeline/connection.tsx
 *  — keep in sync): without it every record misses the groupBy dimension and
 *  the CSV would be empty. Mirrors the renderer's compositing and its
 *  total===0/count>0 → null ratio gap. */
function preprocessConnectionRecords(records: AnalyticsDataPoint[]): AnalyticsDataPoint[] {
	const out: AnalyticsDataPoint[] = [];
	for (const r of records) {
		const { path, method, total, count } = r;
		if (typeof path !== 'string' && typeof path !== 'number') { continue; }
		if (typeof method !== 'string' && typeof method !== 'number') { continue; }
		const nullGap = total === 0 && typeof count === 'number' && count > 0;
		out.push({ ...r, pathMethod: `${path} · ${method}`, ratio: nullGap ? null : r.ratio });
	}
	return out;
}

/** See MetricRenderer.wantsStackedAreaNodeRemap. */
function stackedAreaNodeRemap(spec: MetricSpec, isPerNodeMode: boolean): boolean {
	return spec.primitive === 'stacked-area'
		&& isPerNodeMode
		&& spec.series.kind === 'groupBy'
		&& spec.series.dimension !== 'node';
}

/** See MetricRenderer.wantsClusterLineFold. */
function clusterLineFold(spec: MetricSpec, isPerNodeMode: boolean): boolean {
	return spec.primitive === 'line'
		&& !isPerNodeMode
		&& spec.series.kind === 'groupBy'
		&& spec.series.dimension === 'node';
}

/** See MetricRenderer.wantsDimensionLineSplit. */
function dimensionLineSplit(spec: MetricSpec): boolean {
	return spec.primitive === 'line'
		&& spec.series.kind === 'groupBy'
		&& spec.series.dimension !== 'node';
}

/** Recompute the chart data a panel renders, for CSV serialization.
 *  Returns null when the metric is unknown or there is nothing to export. */
export function computeMetricCsvData(
	metric: string,
	records: AnalyticsDataPoint[],
	timeRange: TimeRange,
	nodes: string[],
	viewMode?: 'per-node' | 'aggregate',
): ChartCsvData | null {
	if (records.length === 0) { return null; }

	const derived = derivedRegistry[metric];
	if (derived) {
		return { kind: 'series', data: derived.recompute(records, timeRange, nodes, viewMode) };
	}

	const entry = specRegistry[metric];
	const spec = entry?.spec;
	if (!spec) { return null; }

	if (spec.primitive === 'heatmap') {
		// The only heatmap metric is replication-latency; export its default
		// (p95) matrix — the renderer's quantile selector state is internal.
		return { kind: 'heatmap', data: aggregateReplicationMatrix(records, nodes) };
	}

	if (entry.Renderer) {
		// Custom renderers (DimensionSelectorRenderer, TrafficByTypeRenderer,
		// memory, connection, …) layer chip/quantile UI over the spec's own
		// pipeline. Export the spec's natural grouping — every dimension value,
		// cluster-aggregated — which is the full dataset behind those views.
		const rows = metric === 'connection' ? preprocessConnectionRecords(records) : records;
		return { kind: 'series', data: runPipeline(spec, rows, timeRange, nodes, { snapToPeriod: true }) };
	}

	const isPerNodeMode = (viewMode ?? 'per-node') === 'per-node';

	if (spec.primitive === 'small-multiples') {
		if (spec.series.kind !== 'field') { return null; }
		const series: Series[] = [];
		for (const field of spec.series.fields) {
			const innerSpec: MetricSpec = {
				...spec,
				series: { kind: 'field', fields: [field] },
				aggregator: {
					temporal: field.aggregator?.temporal ?? spec.aggregator.temporal,
					crossNode: field.aggregator?.crossNode ?? spec.aggregator.crossNode,
				},
			};
			const out = runPipeline(innerSpec, records, timeRange, nodes, { perNode: isPerNodeMode, snapToPeriod: true });
			series.push(...out.series);
			// Each panel's ceiling (if any) becomes a regular column — SeriesData
			// has a single ceiling slot, which can't carry one per panel.
			if (out.ceiling) { series.push(out.ceiling); }
		}
		return { kind: 'series', data: { series } };
	}

	if (stackedAreaNodeRemap(spec, isPerNodeMode) && spec.series.kind === 'groupBy') {
		const remapped: MetricSpec = { ...spec, series: { ...spec.series, dimension: 'node' } };
		return { kind: 'series', data: runPipeline(remapped, records, timeRange, nodes, { snapToPeriod: true }) };
	}
	if (clusterLineFold(spec, isPerNodeMode) && spec.series.kind === 'groupBy') {
		const inner: MetricSpec = {
			...spec,
			series: { kind: 'field', fields: [{ ...spec.series.field, label: 'cluster' }] },
		};
		return { kind: 'series', data: runPipeline(inner, records, timeRange, nodes, { snapToPeriod: true }) };
	}
	if (dimensionLineSplit(spec)) {
		return {
			kind: 'series',
			data: runPipeline(spec, records, timeRange, nodes, { perNode: false, snapToPeriod: true }),
		};
	}
	return {
		kind: 'series',
		data: runPipeline(spec, records, timeRange, nodes, { perNode: isPerNodeMode, snapToPeriod: true }),
	};
}
