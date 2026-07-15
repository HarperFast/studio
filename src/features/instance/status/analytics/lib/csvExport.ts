// CSV export for Status chart data — serializes the pipeline output shapes
// (SeriesData / HeatmapData) that the chart primitives render. Series CSVs
// carry the same numbers as the chart on screen. The heatmap CSV is
// self-describing where the renderer has UI-local state the exporter can't
// see: the value column is named for the quantile actually exported (the
// spec default, regardless of the on-screen quantile selector), and a
// `confidence` column mirrors the chart's suppress/grey tiers — cells the
// chart hides or dims keep their numeric value in the CSV, flagged so the
// consumer can filter. No network calls: everything recomputes from the
// records the panel already fetched.

import { preprocessConnectionRecords } from '../pipeline/connection';
import { derivedRegistry } from '../pipeline/derived/index';
import { specRegistry } from '../pipeline/index';
import { runPipeline } from '../pipeline/pipeline';
import { aggregateReplicationMatrix, type ReplicationQuantileField } from '../pipeline/replication-latency';
import { wantsClusterLineFold, wantsDimensionLineSplit, wantsStackedAreaNodeRemap } from '../primitives/MetricRenderer';
import type { AnalyticsDataPoint, HeatmapData, MetricSpec, Series, SeriesData, TimeRange } from '../types/analytics';
import { filenameTimestamp, slugifyForFilename, triggerBlobDownload } from './chartExport';

/** Discriminated union the CSV button consumes — a panel supplies whichever
 *  shape its primitive renders. */
export type ChartCsvData =
	| { kind: 'series'; data: SeriesData }
	| {
		kind: 'heatmap';
		data: HeatmapData;
		/** Header for the value column (e.g. the quantile the exporter chose,
		 *  'p95'). Defaults to 'value'. */
		valueColumn?: string;
	};

// ─────────────────────────────────────────────────────────────────────────────
// RFC-4180 serialization
// ─────────────────────────────────────────────────────────────────────────────

/** Quote a field per RFC 4180: wrap in double quotes when it contains a
 *  comma, quote, or line break; double any embedded quotes. Cells starting
 *  with `=`, `+`, `-`, `@`, tab, or CR are prefixed with an apostrophe so
 *  spreadsheets import them as text instead of evaluating them as formulas
 *  (labels come from telemetry paths/identifiers — CSV-injection guard).
 *  Numeric cells go through csvNumber and keep their sign. */
function csvField(value: string | number | null | undefined): string {
	if (value === null || value === undefined) { return ''; }
	const asString = String(value);
	const neutralized = /^[=+\-@\t\r]/.test(asString) ? `'${asString}` : asString;
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

/** Confidence tier for one heatmap cell. Mirrors classifyCell in
 *  primitives/HeatmapMatrix.tsx exactly — including the inverted-sounding
 *  boundaries: 'suppress' when count < greyBelow, 'grey' when
 *  greyBelow ≤ count < suppressBelow, 'absent' when the cell has no value.
 *  (Duplicated rather than imported: HeatmapMatrix.tsx is owned by an
 *  in-flight PR — fold this into an import once that lands.) */
function heatmapConfidenceTier(
	value: number | null | undefined,
	count: number | undefined,
	greyBelow: number,
	suppressBelow: number,
): 'ok' | 'grey' | 'suppress' | 'absent' {
	if (value === null || value === undefined) { return 'absent'; }
	const n = count ?? 0;
	if (n < greyBelow) { return 'suppress'; }
	if (n < suppressBelow) { return 'grey'; }
	return 'ok';
}

/** Serialize HeatmapData to CSV as `row,col,<valueColumn>,count` — one line
 *  per cell, in the primitive's row-major cell order. Absent values/counts
 *  are empty cells. When the data carries confidence thresholds, a trailing
 *  `confidence` column reports the chart's tier for each cell ('ok' / 'grey'
 *  / 'suppress' / 'absent'); suppressed and grey cells keep their numeric
 *  value — the chart hides/dims them, the CSV flags them instead. */
export function heatmapToCsv(data: HeatmapData, valueColumn = 'value'): string {
	const confidence = data.confidence;
	const headerCells = ['row', 'col', csvField(valueColumn), 'count'];
	if (confidence) { headerCells.push('confidence'); }
	const header = headerCells.join(',');
	const rows = data.cells.map((c) => {
		const cells = [csvField(c.row), csvField(c.col), csvNumber(c.value), csvNumber(c.count)];
		if (confidence) {
			// Missing thresholds default to 0, matching HeatmapMatrix.
			cells.push(heatmapConfidenceTier(c.value, c.count, confidence.greyBelow ?? 0, confidence.suppressBelow ?? 0));
		}
		return cells.join(',');
	});
	return [header, ...rows].join(CRLF) + CRLF;
}

export function chartCsv(data: ChartCsvData): string {
	return data.kind === 'heatmap' ? heatmapToCsv(data.data, data.valueColumn) : seriesToCsv(data.data);
}

/** `<metric>-<start>-<end>.csv`, metric slugified and timestamps ISO-8601
 *  (with `:`/`.` dashed for filename safety). */
export function makeCsvFilename(metric: string, range: TimeRange): string {
	return `${slugifyForFilename(metric)}-${filenameTimestamp(range.startTime)}-${filenameTimestamp(range.endTime)}.csv`;
}

export function downloadCsv(csv: string, filename: string): void {
	// UTF-8 BOM so Excel detects the encoding (the ' · ' connection-path
	// separator and node names garble without it).
	triggerBlobDownload(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }), filename);
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric → chart-data recompute for the CSV button. Dispatches through the
// same predicates MetricRenderer does (imported from
// primitives/MetricRenderer.tsx) minus the renderer-internal UI state:
// metrics whose custom renderer offers chip filters / quantile selectors
// export their spec's default, unfiltered view.
// ─────────────────────────────────────────────────────────────────────────────

/** The quantile the heatmap CSV exports — the spec default. The renderer's
 *  quantile selector is component-local state the exporter can't observe, so
 *  the CSV always exports this field and names its value column after it. */
const HEATMAP_CSV_QUANTILE: ReplicationQuantileField = 'p95';

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
		// quantile's matrix and name the value column after it so the CSV
		// states what it contains even when the on-screen selector differs.
		return {
			kind: 'heatmap',
			data: aggregateReplicationMatrix(records, nodes, HEATMAP_CSV_QUANTILE),
			valueColumn: HEATMAP_CSV_QUANTILE,
		};
	}

	if (entry.Renderer) {
		// Custom renderers (DimensionSelectorRenderer, TrafficByTypeRenderer,
		// memory, connection, …) layer chip/quantile UI over the spec's own
		// pipeline. Export the spec's natural grouping — every dimension value,
		// cluster-aggregated — which is the full dataset behind those views.
		// `connection` groups on the synthetic pathMethod field, so it needs
		// the renderer's own preprocessing first.
		const rows = metric === 'connection' ? preprocessConnectionRecords(records).records : records;
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

	if (wantsStackedAreaNodeRemap(spec, isPerNodeMode) && spec.series.kind === 'groupBy') {
		const remapped: MetricSpec = { ...spec, series: { ...spec.series, dimension: 'node' } };
		return { kind: 'series', data: runPipeline(remapped, records, timeRange, nodes, { snapToPeriod: true }) };
	}
	if (wantsClusterLineFold(spec, isPerNodeMode) && spec.series.kind === 'groupBy') {
		const inner: MetricSpec = {
			...spec,
			series: { kind: 'field', fields: [{ ...spec.series.field, label: 'cluster' }] },
		};
		return { kind: 'series', data: runPipeline(inner, records, timeRange, nodes, { snapToPeriod: true }) };
	}
	if (wantsDimensionLineSplit(spec)) {
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
