import { type JSX, useMemo, useRef, useState } from 'react';
import { HeatmapDrilldownDialog } from '../components/HeatmapDrilldownDialog';
import { useRovingRadioGroup } from '../hooks/useRovingRadioGroup';
import { infoBannerStyle, warningBannerStyle } from '../primitives/bannerStyle';
import { HeatmapMatrix } from '../primitives/HeatmapMatrix';
import { LineChart } from '../primitives/LineChart';
import type {
	AnalyticsDataPoint,
	HeatmapCell,
	HeatmapData,
	MetricSpec,
	Series,
	SeriesData,
	SeriesPoint,
	SpecRegistryRendererProps,
} from '../types/analytics';
import { type AggInput, aggregate } from './aggregators';
import { parseReplicationPath } from './pathParser';
import { QUANTILE_FIELDS as REPLICATION_QUANTILE_FIELDS, type QuantileField } from './quantileFields';

export { REPLICATION_QUANTILE_FIELDS };
export type ReplicationQuantileField = QuantileField['field'];

// ─────────────────────────────────────────────────────────────────────────────
// Spec
// ─────────────────────────────────────────────────────────────────────────────

/** Confidence tiers shared by the heatmap cells, the line fallback, and the
 *  spec itself: below `greyBelow` a cell/pair is suppressed, between the two
 *  it renders dimmed.
 *  TODO(spec): calibrated for high-volume clusters. Real Harper data with
 *  per-record count 2-14 may need re-tuning. See Step 2.5 follow-up. */
export const REPLICATION_CONFIDENCE = { greyBelow: 40, suppressBelow: 100 } as const;

export const replicationLatencySpec: MetricSpec = {
	title: 'Replication latency',
	description: 'Source → destination p95 latency, count-weighted-mean across the window. Approximate.',
	tab: 'replication',
	primaryDimension: 'path',
	subDimension: 'node',
	series: {
		kind: 'groupBy',
		dimension: 'path',
		field: { field: 'p95', label: 'p95 latency' },
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'count-weighted-mean', crossNode: 'count-weighted-mean' },
	confidence: REPLICATION_CONFIDENCE,
	primitive: 'heatmap',
	yAxis: { unit: '', formatter: 'ms' },
};

function pluralize(n: number, one: string, many: string): string {
	return n === 1 ? one : many;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure pipeline: records -> HeatmapData
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedRecord {
	source: string;
	destination: string;
	value: number;
	count: number;
	/** Null when the record carried no numeric `time` — the matrix ignores
	 *  time, but line series must skip these (an x of 0 plots at 1970). */
	time: number | null;
}

interface ParseResult {
	parsed: ParsedRecord[];
	/** Records dropped because `path` didn't parse into source/db/table. */
	unparseablePathCount: number;
	/** Records dropped because the selected quantile carried no finite value. */
	missingValueCount: number;
	unrecognizedSources: string[];
}

/** Single parse pass shared by the matrix and the line fallback — the
 *  renderer parses each record exactly once per (records, nodes, quantile)
 *  instead of re-parsing per surviving cell. */
function parseRecords(
	records: AnalyticsDataPoint[],
	nodes: readonly string[],
	quantileField: ReplicationQuantileField,
): ParseResult {
	let unparseablePathCount = 0;
	let missingValueCount = 0;
	const parsed: ParsedRecord[] = [];
	const unrecognized = new Set<string>();
	const knownSet = new Set(nodes);
	for (const r of records) {
		const path = typeof r.path === 'string' ? r.path : '';
		const parsedPath = parseReplicationPath(path, nodes);
		if (!parsedPath) {
			unparseablePathCount++;
			continue;
		}
		// pathParser falls back to a heuristic split when no known-node
		// matches. Track the heuristic-recovered sources so the renderer
		// can surface them — the operator may want to confirm those are
		// real peers.
		if (!knownSet.has(parsedPath.source)) {
			unrecognized.add(parsedPath.source);
		}
		const v = (r as Record<string, unknown>)[quantileField];
		const value = typeof v === 'number' ? v : NaN;
		const count = typeof r.count === 'number' ? r.count : 0;
		if (!Number.isFinite(value)) {
			missingValueCount++;
			continue;
		}
		parsed.push({
			source: parsedPath.source,
			destination: r.node,
			value,
			count,
			time: typeof r.time === 'number' ? r.time : null,
		});
	}
	return { parsed, unparseablePathCount, missingValueCount, unrecognizedSources: [...unrecognized].sort() };
}

function matrixFromParsed(result: ParseResult): HeatmapData {
	const { parsed, unparseablePathCount, missingValueCount, unrecognizedSources } = result;
	const skipped = unparseablePathCount + missingValueCount;

	if (parsed.length === 0) {
		return {
			rows: [],
			cols: [],
			cells: [],
			axis: { unit: '', formatter: 'ms' },
			confidence: REPLICATION_CONFIDENCE,
			rowAxisLabel: 'Source',
			colAxisLabel: 'Destination',
			skippedRecordsCount: skipped,
			unparseablePathCount,
			missingValueCount,
			unrecognizedSources,
			approx: true,
		};
	}

	// Group by (source, destination)
	const groups = new Map<string, { items: AggInput[]; totalCount: number }>();
	const sourceSet = new Set<string>();
	const destSet = new Set<string>();
	for (const r of parsed) {
		sourceSet.add(r.source);
		destSet.add(r.destination);
		const key = `${r.source}|${r.destination}`;
		let g = groups.get(key);
		if (!g) {
			g = { items: [], totalCount: 0 };
			groups.set(key, g);
		}
		g.items.push({ value: r.value, count: r.count });
		g.totalCount += r.count;
	}

	const rows = [...sourceSet].sort();
	const cols = [...destSet].sort();

	let approx = false;
	const cells: HeatmapCell[] = [];
	for (const row of rows) {
		for (const col of cols) {
			const g = groups.get(`${row}|${col}`);
			if (g) {
				if (g.items.length > 1) { approx = true; }
				cells.push({
					row,
					col,
					value: aggregate('count-weighted-mean', g.items),
					count: g.totalCount,
				});
			} else {
				cells.push({ row, col, value: null, count: 0 });
			}
		}
	}

	return {
		rows,
		cols,
		cells,
		axis: { unit: '', formatter: 'ms' },
		confidence: REPLICATION_CONFIDENCE,
		rowAxisLabel: 'Source',
		colAxisLabel: 'Destination',
		skippedRecordsCount: skipped,
		unparseablePathCount,
		missingValueCount,
		unrecognizedSources,
		approx,
	};
}

export function aggregateReplicationMatrix(
	records: AnalyticsDataPoint[],
	nodes: readonly string[],
	quantileField: ReplicationQuantileField = 'p95',
): HeatmapData {
	return matrixFromParsed(parseRecords(records, nodes, quantileField));
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper: per (source, dest) line series with count-weighted-mean buckets
// keyed by record.time. Returns approx=true when any time-bucket aggregates
// more than one source record (e.g. multiple table paths).
// ─────────────────────────────────────────────────────────────────────────────

export function bucketLineSeries(
	records: AnalyticsDataPoint[],
	source: string,
	dest: string,
	nodes: readonly string[],
	quantileField: ReplicationQuantileField = 'p95',
): { points: SeriesPoint[]; approx: boolean } {
	// Pre-filter on destination (`node`) so the standalone entry point keeps
	// its old skip-before-parse fast path; the renderer itself goes through
	// buildLineSeries, which shares one parse across all pairs.
	const { parsed } = parseRecords(records.filter((r) => r.node === dest), nodes, quantileField);
	return lineSeriesFromParsed(parsed.filter((p) => p.source === source));
}

function lineSeriesFromParsed(matching: ParsedRecord[]): { points: SeriesPoint[]; approx: boolean } {
	const bucketsByTime = new Map<number, AggInput[]>();
	const totalCountByTime = new Map<number, number>();
	for (const m of matching) {
		if (m.time === null) { continue; }
		let bucket = bucketsByTime.get(m.time);
		if (!bucket) {
			bucket = [];
			bucketsByTime.set(m.time, bucket);
		}
		bucket.push({ value: m.value, count: m.count });
		totalCountByTime.set(m.time, (totalCountByTime.get(m.time) ?? 0) + m.count);
	}

	let approx = false;
	const sortedTimes = [...bucketsByTime.keys()].sort((a, b) => a - b);
	const points: SeriesPoint[] = [];
	for (const time of sortedTimes) {
		const bucket = bucketsByTime.get(time)!;
		if (bucket.length > 1) { approx = true; }
		points.push({
			x: time,
			y: aggregate('count-weighted-mean', bucket),
			count: totalCountByTime.get(time) ?? 0,
		});
	}

	return { points, approx };
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_MAX_CELLS = 12;

function buildLineSeries(
	parsed: ParsedRecord[],
	data: HeatmapData,
): { seriesData: SeriesData; omittedPairsCount: number } {
	const greyBelow = data.confidence?.greyBelow ?? 0;
	const suppressBelow = data.confidence?.suppressBelow ?? Infinity;

	// Group the (already-parsed) records by pair once, instead of re-scanning
	// every record per surviving cell.
	const byPair = new Map<string, ParsedRecord[]>();
	for (const p of parsed) {
		const key = `${p.source}|${p.destination}`;
		let group = byPair.get(key);
		if (!group) {
			group = [];
			byPair.set(key, group);
		}
		group.push(p);
	}

	const series: Series[] = [];
	let omittedPairsCount = 0;

	for (const cell of data.cells) {
		const count = cell.count ?? 0;
		if (count === 0) {
			// Truly absent pair — skip silently.
			continue;
		}
		if (count < greyBelow) {
			omittedPairsCount += 1;
			continue;
		}
		const out = lineSeriesFromParsed(byPair.get(`${cell.row}|${cell.col}`) ?? []);
		if (out.points.length === 0) { continue; }
		const key = `${cell.row}→${cell.col}`;
		if (count < suppressBelow) {
			// Grey tier: dim to flag low confidence.
			series.push({
				key,
				label: key,
				points: out.points,
				approx: out.approx,
				opacity: 0.55,
			});
		} else {
			series.push({
				key,
				label: key,
				points: out.points,
				approx: out.approx,
			});
		}
	}

	return { seriesData: { series }, omittedPairsCount };
}

interface DrilldownData {
	suppressed: boolean;
	sampleCount: number;
	seriesData: SeriesData;
}

export function ReplicationLatencyRenderer(props: SpecRegistryRendererProps): JSX.Element {
	const { records, nodes, timeRange, fillParent } = props;

	const [quantile, setQuantile] = useState<ReplicationQuantileField>('p95');
	// Heatmap-cell drilldown target. `drillPair` survives close (open is
	// tracked separately) so Radix's exit animation keeps its content
	// instead of unmounting mid-transition.
	const [drillPair, setDrillPair] = useState<{ source: string; dest: string } | null>(null);
	const [drillOpen, setDrillOpen] = useState(false);

	// Parse once per (records, nodes, quantile); the matrix and the line
	// fallback both consume the same parsed records.
	const parseResult = useMemo(
		() => parseRecords(records, nodes, quantile),
		[records, nodes, quantile],
	);
	const data = useMemo(() => matrixFromParsed(parseResult), [parseResult]);

	// Single-pair series for the drilldown dialog. Recomputes with the live
	// quantile/window, so the open dialog tracks the selectors — and re-applies
	// the confidence gate: a refresh can drop the pair below `greyBelow`, and
	// the dialog must then hide the series just like the heatmap cell does.
	// Once closed, background refreshes skip the recompute (drillPair is kept
	// for the Radix exit animation, so without the gate every refresh would
	// re-filter all records for an invisible dialog forever); the ref serves
	// the last computed content to the exit animation instead.
	const lastDrilldownRef = useRef<DrilldownData | null>(null);
	const drilldown = useMemo(() => {
		if (!drillPair) { return null; }
		if (!drillOpen) { return lastDrilldownRef.current; }
		const matching = parseResult.parsed.filter(
			(p) => p.source === drillPair.source && p.destination === drillPair.dest,
		);
		const sampleCount = matching.reduce((sum, p) => sum + p.count, 0);
		const { points, approx } = lineSeriesFromParsed(matching);
		const label = `${drillPair.source} → ${drillPair.dest}`;
		const result: DrilldownData = {
			suppressed: sampleCount < REPLICATION_CONFIDENCE.greyBelow,
			sampleCount,
			// Empty points (e.g. every record lacked a numeric `time`) fall
			// through to LineChart's "No data in window" state inside the dialog.
			seriesData: { series: points.length === 0 ? [] : [{ key: label, label, points, approx }] } as SeriesData,
		};
		lastDrilldownRef.current = result;
		return result;
	}, [drillPair, drillOpen, parseResult]);

	const quantileLabel = REPLICATION_QUANTILE_FIELDS.find((q) => q.field === quantile)?.label ?? quantile;

	// Rendered in every branch below (heatmap, line fallback, empty state) so
	// a background refresh that changes the layout doesn't abruptly unmount an
	// open drilldown.
	const drilldownDialog = drillPair && drilldown
		? (
			<HeatmapDrilldownDialog
				source={drillPair.source}
				target={drillPair.dest}
				open={drillOpen}
				onOpenChange={(open) => {
					// Keep drillPair on close — the exit animation needs the content.
					if (!open) { setDrillOpen(false); }
				}}
				description={`${quantileLabel} replication latency over the selected window, count-weighted-mean per time bucket.`}
			>
				{drilldown.suppressed
					? (
						<div role="status" className="text-(--color-text-secondary) text-sm p-4">
							{`Fewer than ${REPLICATION_CONFIDENCE.greyBelow} samples for this pair in the current window (${drilldown.sampleCount}) — series hidden.`}
						</div>
					)
					: (
						<LineChart
							data={drilldown.seriesData}
							yAxis={data.axis}
							height={320}
							xDomain={[timeRange.startTime, timeRange.endTime]}
							fillParent
						/>
					)}
			</HeatmapDrilldownDialog>
		)
		: null;

	// Empty state — still surface skipped-records banner so users see the cause
	// when 100% of records had unparseable source nodes.
	if (data.rows.length === 0 || data.cols.length === 0) {
		return (
			<div>
				<RecognitionBanner data={data} />

				<div>No data in window</div>
				{drilldownDialog}
			</div>
		);
	}

	const cellTotal = data.rows.length * data.cols.length;
	const tooManyCells = cellTotal > FALLBACK_MAX_CELLS;
	const tooFewDimensions = data.rows.length < 2 || data.cols.length < 2;
	const useFallback = tooFewDimensions || tooManyCells;

	if (useFallback) {
		const { seriesData, omittedPairsCount } = buildLineSeries(parseResult.parsed, data);
		const greyBelow = data.confidence?.greyBelow ?? REPLICATION_CONFIDENCE.greyBelow;
		const message = tooManyCells
			? 'Too many source-destination pairs for a heatmap — showing as lines.'
			: 'Only one source node emitted data in this window. This is typical for clusters with a single write origin — each line below shows latency from that source to one destination.';

		const allDropped = seriesData.series.length === 0 && omittedPairsCount > 0;
		const noData = seriesData.series.length === 0 && omittedPairsCount === 0;

		// Banners stack at the top in normal document flow; the chart sits
		// below with explicit vertical space. No flex height-juggling — the
		// fixed-height LineChart was clipping/overlapping when it competed
		// with the banner stack for a flex-shared box.
		return (
			<div>
				<div
					style={{
						fontSize: 11,
						opacity: 0.7,
						marginBottom: 4,
					}}
				>
					Showing as lines
				</div>
				<RecognitionBanner data={data} />
				{
					/* Suppress the omitted-pairs banner when all-dropped fires — the
				    all-dropped banner already cites the count, so showing both is
				    redundant. */
				}
				{omittedPairsCount > 0 && !allDropped
					? (
						<div
							key={omittedPairsCount}
							role="status"
							aria-atomic="true"
							style={warningBannerStyle}
						>
							{`${omittedPairsCount} source-destination ${
								pluralize(omittedPairsCount, 'pair', 'pairs')
							} hidden — fewer than ${greyBelow} samples.`}
						</div>
					)
					: null}
				<div style={infoBannerStyle}>
					{message}
				</div>
				{allDropped
					? (
						<div
							role="status"
							aria-atomic="true"
							style={warningBannerStyle}
						>
							{`No source-destination pairs cleared the confidence threshold (${greyBelow}+ samples). All ${omittedPairsCount} ${
								pluralize(omittedPairsCount, 'pair', 'pairs')
							} had fewer than ${greyBelow} samples in this window.`}
						</div>
					)
					: noData
					? <div>No data in window</div>
					: (
						<div style={{ marginTop: 20 }}>
							<LineChart
								data={seriesData}
								yAxis={data.axis}
								height={320}
								xDomain={[timeRange.startTime, timeRange.endTime]}
								fillParent={fillParent}
							/>
						</div>
					)}
				{drilldownDialog}
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<QuantileSelector value={quantile} onChange={setQuantile} />
			<RecognitionBanner data={data} />
			<div className="min-h-0 flex-1">
				{
					/* Zero the primitive's generic skipped-count banner — the
				    RecognitionBanner above already reports omissions with
				    cause-specific copy, so letting both render double-reports. */
				}
				<HeatmapMatrix
					data={{ ...data, skippedRecordsCount: 0, measureLabel: `${quantileLabel} latency` }}
					title="Replication latency"
					onCellSelect={(row, col) => {
						setDrillPair({ source: row, dest: col });
						setDrillOpen(true);
					}}
				/>
			</div>
			{drilldownDialog}
		</div>
	);
}

interface RecognitionBannerProps {
	data: HeatmapData;
}

/** Renders a single role='status' banner combining the two omission causes
 *  (unparseable path vs. missing percentile value) and the
 *  heuristic-recovered source count. Any subset may be present. */
function RecognitionBanner({ data }: RecognitionBannerProps) {
	const unparseable = data.unparseablePathCount ?? 0;
	const missingValue = data.missingValueCount ?? 0;
	const unrecognized = data.unrecognizedSources ?? [];
	if (unparseable === 0 && missingValue === 0 && unrecognized.length === 0) { return null; }

	const parts: string[] = [];
	if (unparseable > 0) {
		parts.push(
			`${unparseable} ${pluralize(unparseable, 'record', 'records')} omitted (unparseable replication path).`,
		);
	}
	if (missingValue > 0) {
		parts.push(
			`${missingValue} ${pluralize(missingValue, 'record', 'records')} omitted (no value for the selected percentile).`,
		);
	}
	if (unrecognized.length > 0) {
		parts.push(
			`Recovered ${unrecognized.length} source${unrecognized.length === 1 ? '' : 's'} not in the cluster snapshot: ${
				unrecognized.join(', ')
			}.`,
		);
	}

	return (
		<div
			key={`${unparseable}-${missingValue}-${unrecognized.length}`}
			role="status"
			aria-atomic="true"
			style={warningBannerStyle}
		>
			{parts.join(' ')}
		</div>
	);
}

interface QuantileSelectorProps {
	value: ReplicationQuantileField;
	onChange: (q: ReplicationQuantileField) => void;
}

function QuantileSelector({ value, onChange }: QuantileSelectorProps) {
	const { getRadioProps } = useRovingRadioGroup(
		REPLICATION_QUANTILE_FIELDS.map((q) => q.field),
		value,
		onChange,
	);
	return (
		<div role="radiogroup" aria-label="Quantile" className="flex flex-wrap gap-1 pb-2">
			{REPLICATION_QUANTILE_FIELDS.map((q, idx) => {
				const active = q.field === value;
				return (
					<button
						key={q.field}
						type="button"
						data-testid="quantile-button"
						data-value={q.field}
						{...getRadioProps(idx)}
						className={`rounded px-2 py-0.5 text-[11px] ${
							active
								? 'bg-(--color-accent)/20 text-(--color-text-primary) font-semibold'
								: 'bg-(--color-bg-tertiary) text-(--color-text-secondary) hover:text-(--color-text-primary)'
						}`}
					>
						{q.label}
					</button>
				);
			})}
		</div>
	);
}
