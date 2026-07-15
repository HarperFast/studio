import type { TableSizeRecord, TimeRange } from '../types/analytics';

export type RankBy = 'bytes' | 'percent';
export type EmptyCause = 'upstream-empty' | 'all-other' | null;

export interface NormalizedRecord {
	database: string;
	table: string;
	/** Stable "table key" used everywhere as "database.table". */
	tableKey: string;
	node: string;
	/** Timestamp in ms (normalized from Harper's `id` field). */
	time: number;
	size: number;
}

export interface SnapshotByNodeEntry {
	node: string;
	/** Map of tableKey -> bytes, restricted to tables in `tableSet` (plus "Other" when applicable). */
	stacks: Record<string, number>;
	/** Sum of all bytes for this node across ALL tables (not just the top-N). */
	total: number;
}

export interface Snapshot {
	byNode: SnapshotByNodeEntry[];
	/** Top-N table keys, in stable display order (rank desc, tie-break alphabetical). */
	tableSet: string[];
	hasOther: boolean;
	/** Tables rolled into Other (for tooltips/diagnostics). */
	otherMembers: string[];
}

export interface TrendPoint {
	/** Bucket timestamp (ms) — an epoch-aligned multiple of the bucket size,
	 *  matching the pipeline's snapToPeriod grid so syncMethod="value"
	 *  crosshair sync can match this chart's x values against the panels'. */
	time: number;
	values: Record<string, /* node */ number /* bytes */>;
}

export interface TableSizeDerived {
	snapshot: Snapshot;
	trend: (selectedTable: string) => TrendPoint[];
	defaultSelection: (rankBy: RankBy) => string | null;
	emptyCause: EmptyCause;
	/** Content signature for memo keys. */
	signature: string;
}

/** Targeted max number of top-N tables on Panel 1. */
export const TOP_N = 8;

export const OTHER_KEY = '__other__';

/** Threshold below which a table is considered empty/static and excluded from top-N. */
const MEANINGFUL_SIZE_THRESHOLD = 4096;

/** Compute bucket width (ms) for trend rendering.
 *
 *  `alignMs` (the tab's fetch bucket size, AnalyticsContext.bucketMs) rounds
 *  the width up to a multiple of the metric panels' bucket grid: combined
 *  with the epoch-aligned snapping in computeTrendFactory, every trend
 *  timestamp then lands on a panel timestamp, so hovering the trend reliably
 *  drives the synced crosshair on the other Storage-tab panels (#1514). */
export function computeBucketMs(windowMs: number, alignMs?: number): number {
	const base = Math.max(60_000, Math.ceil(windowMs / 90));
	if (typeof alignMs === 'number' && Number.isFinite(alignMs) && alignMs > 0) {
		return Math.ceil(base / alignMs) * alignMs;
	}
	return base;
}

/** Build a stable "database.table" key. */
export function toTableKey(r: { database: string; table: string }): string {
	return `${r.database}.${r.table}`;
}

/** Normalize raw records: map id→time, sort by time, build tableKey. Does NOT dedup. */
export function normalizeRecords(raw: TableSizeRecord[]): NormalizedRecord[] {
	const out: NormalizedRecord[] = raw.map((r) => ({
		database: r.database,
		table: r.table,
		tableKey: toTableKey(r),
		// `node` is typed `string`, but some Harper builds serialize a numeric
		// node name as a JSON number (or omit it entirely). Coerce here — the
		// single boundary where the NormalizedRecord contract is established —
		// so every downstream consumer (sort via localeCompare, dedup/trend
		// grouping keys) can safely treat it as a string.
		node: r.node == null ? '' : String(r.node),
		time: r.id,
		size: r.size,
	}));
	// Stable sort by time ascending; Array.prototype.sort is stable in Node 22+.
	out.sort((a, b) => a.time - b.time);
	return out;
}

/** Drop consecutive unchanged-size repeats per (node, tableKey). */
export function dedupRecords(normalized: NormalizedRecord[]): NormalizedRecord[] {
	const lastSize = new Map<string, number>(); // key = `${node}\0${tableKey}`
	const kept: NormalizedRecord[] = [];
	for (const r of normalized) {
		const key = `${r.node}\0${r.tableKey}`;
		if (lastSize.get(key) === r.size) { continue; // unchanged repeat
		 }
		kept.push(r);
		lastSize.set(key, r.size);
	}
	return kept;
}

/** Rank tables by max-per-node size; return top-N keys and rollup membership. */
export function computeTableSet(
	normalized: NormalizedRecord[],
): { tableSet: string[]; hasOther: boolean; otherMembers: string[] } {
	// For each tableKey, compute max size observed on ANY single node in the window.
	// Note: use `has`/`undefined` as the "not yet seen" sentinel, not `0`, so a
	// table whose size is 0 still appears in the key set and flows through to
	// otherMembers (rather than being silently dropped).
	const maxPerNode = new Map<string, number>(); // tableKey -> max over nodes of (max over time)
	const perNodeMax = new Map<string, number>(); // `${tableKey}\0${node}` -> max size
	for (const r of normalized) {
		const k = `${r.tableKey}\0${r.node}`;
		const prev = perNodeMax.get(k);
		if (prev === undefined || r.size > prev) { perNodeMax.set(k, r.size); }
	}
	for (const [k, v] of perNodeMax) {
		const [tableKey] = k.split('\0');
		const prev = maxPerNode.get(tableKey);
		if (prev === undefined || v > prev) { maxPerNode.set(tableKey, v); }
	}

	// Keep only meaningful tables.
	const meaningful = [...maxPerNode.entries()].filter(
		([, v]) => v > MEANINGFUL_SIZE_THRESHOLD,
	);

	// Rank desc, tie-break alphabetical.
	meaningful.sort((a, b) => {
		if (b[1] !== a[1]) { return b[1] - a[1]; }
		return a[0].localeCompare(b[0]);
	});

	const allMeaningfulKeys = meaningful.map(([k]) => k);

	// Top-N rule:
	//   <= TOP_N+1 meaningful tables -> keep all inline; no rollup.
	//   > TOP_N+1 -> keep top-N; roll up the rest into Other.
	// Below-threshold tables always land in Other so they stay discoverable in
	// the tooltip / aggregate stack. Without this, on clusters like ours — where
	// ~17 static 4 KB tables sit alongside 3 growing ones — the static cohort
	// vanishes from the UI entirely.
	const belowThreshold = [...maxPerNode.keys()].filter(
		(k) => !allMeaningfulKeys.includes(k),
	);
	belowThreshold.sort((a, b) => a.localeCompare(b));

	if (allMeaningfulKeys.length <= TOP_N + 1) {
		return {
			tableSet: allMeaningfulKeys,
			hasOther: belowThreshold.length > 0,
			otherMembers: belowThreshold,
		};
	}

	const tableSet = allMeaningfulKeys.slice(0, TOP_N);
	const rolledUpMeaningful = allMeaningfulKeys.slice(TOP_N);
	const otherMembers = [...rolledUpMeaningful, ...belowThreshold];
	return { tableSet, hasOther: otherMembers.length > 0, otherMembers };
}

/** Build the per-node snapshot rows using the supplied tableSet. */
export function computeSnapshot(
	normalized: NormalizedRecord[],
	tableSet: string[],
	hasOther: boolean,
): SnapshotByNodeEntry[] {
	// For each (node, tableKey), find the latest size.
	const latest = new Map<string, { size: number; time: number; tableKey: string; node: string }>();
	for (const r of normalized) {
		const k = `${r.node}\0${r.tableKey}`;
		const prev = latest.get(k);
		if (!prev || r.time >= prev.time) {
			latest.set(k, { size: r.size, time: r.time, tableKey: r.tableKey, node: r.node });
		}
	}

	const top = new Set(tableSet);
	const byNode = new Map<string, SnapshotByNodeEntry>();
	for (const { size, tableKey, node } of latest.values()) {
		if (!byNode.has(node)) { byNode.set(node, { node, stacks: {}, total: 0 }); }
		const entry = byNode.get(node)!;
		entry.total += size;
		if (top.has(tableKey)) {
			entry.stacks[tableKey] = size;
		} else if (hasOther) {
			entry.stacks[OTHER_KEY] = (entry.stacks[OTHER_KEY] ?? 0) + size;
		}
		// else: below-threshold table in a no-rollup case — contributes to total only.
	}

	// Sort nodes for stable display order.
	return [...byNode.values()].sort((a, b) => a.node.localeCompare(b.node));
}

/** Build a factory that returns trend points for a given table. */
export function computeTrendFactory(
	normalized: NormalizedRecord[],
	range: TimeRange,
	alignMs?: number,
): (selectedTable: string) => TrendPoint[] {
	const bucketMs = computeBucketMs(range.endTime - range.startTime, alignMs);

	return function trend(selectedTable: string): TrendPoint[] {
		// Collect the latest sample per (bucket, node) for the selected table.
		const byBucket = new Map<number, Map<string, { size: number; time: number }>>();
		// Track each node's last populated bucket to truncate anything trailing it.
		const lastBucketTime = new Map<string, number>();

		for (const r of normalized) {
			if (r.tableKey !== selectedTable) { continue; }
			if (r.time < range.startTime || r.time > range.endTime) { continue; }
			// Epoch-aligned, round-to-nearest — the exact convention of the
			// pipeline's snapToBucketTime. The old grid anchored buckets at
			// range.startTime, which put trend timestamps on a lattice no other
			// chart shared, so syncMethod="value" crosshairs never matched the
			// Storage tab's metric panels (#1514).
			const bucketTime = Math.round(r.time / bucketMs) * bucketMs;
			if (!byBucket.has(bucketTime)) { byBucket.set(bucketTime, new Map()); }
			const nodeMap = byBucket.get(bucketTime)!;
			const prev = nodeMap.get(r.node);
			if (!prev || r.time >= prev.time) {
				nodeMap.set(r.node, { size: r.size, time: r.time });
			}
			const lastBucket = lastBucketTime.get(r.node) ?? 0;
			if (bucketTime > lastBucket) { lastBucketTime.set(r.node, bucketTime); }
		}

		const points: TrendPoint[] = [];
		const sortedBuckets = [...byBucket.keys()].sort((a, b) => a - b);
		for (const bucketTime of sortedBuckets) {
			const nodeMap = byBucket.get(bucketTime)!;
			const values: Record<string, number> = {};
			for (const [node, { size }] of nodeMap) {
				// Drop buckets past the node's last populated bucket (truncate trailing).
				const lastBucket = lastBucketTime.get(node) ?? 0;
				if (bucketTime > lastBucket) { continue; }
				values[node] = size;
			}
			if (Object.keys(values).length > 0) { points.push({ time: bucketTime, values }); }
		}
		return points;
	};
}

/** Compute the default selection (largest delta) for a given ranking. */
export function computeDefaultSelection(
	normalized: NormalizedRecord[],
	rankBy: RankBy,
): string | null {
	if (normalized.length === 0) { return null; }

	// Group samples by (tableKey, node) to compute per-node min/max.
	const perPair = new Map<string, { min: number; max: number; distinctTimes: Set<number> }>();
	for (const r of normalized) {
		const key = `${r.tableKey}\0${r.node}`;
		let agg = perPair.get(key);
		if (!agg) {
			agg = { min: r.size, max: r.size, distinctTimes: new Set() };
			perPair.set(key, agg);
		}
		if (r.size < agg.min) { agg.min = r.size; }
		if (r.size > agg.max) { agg.max = r.size; }
		agg.distinctTimes.add(r.time);
	}

	// Per table, find the best (max) per-node delta.
	type Score = { tableKey: string; delta: number; maxSize: number; hasDelta: boolean };
	const perTable = new Map<string, Score>();
	for (const [key, agg] of perPair) {
		const [tableKey] = key.split('\0');
		const hasDelta = agg.distinctTimes.size >= 2 && agg.max > agg.min;
		const deltaBytes = agg.max - agg.min;
		const deltaPct = agg.max > 0 ? deltaBytes / agg.max : 0;
		const score = rankBy === 'bytes' ? deltaBytes : deltaPct;

		const prev = perTable.get(tableKey);
		if (!prev) {
			perTable.set(tableKey, { tableKey, delta: score, maxSize: agg.max, hasDelta });
		} else {
			if (score > prev.delta) { prev.delta = score; }
			if (agg.max > prev.maxSize) { prev.maxSize = agg.max; }
			if (hasDelta) { prev.hasDelta = true; }
		}
	}

	const all = [...perTable.values()];

	// Any table with a computable delta?
	const withDelta = all.filter((s) => s.hasDelta);
	if (withDelta.length > 0) {
		withDelta.sort((a, b) => {
			if (b.delta !== a.delta) { return b.delta - a.delta; }
			return a.tableKey.localeCompare(b.tableKey);
		});
		return withDelta[0].tableKey;
	}

	// Flat window fallback: largest max-size.
	all.sort((a, b) => {
		if (b.maxSize !== a.maxSize) { return b.maxSize - a.maxSize; }
		return a.tableKey.localeCompare(b.tableKey);
	});
	return all[0]?.tableKey ?? null;
}

/** Determine the empty-state discriminator. */
export function computeEmptyCause(
	rawCount: number,
	tableSet: string[],
	hasOther: boolean,
): EmptyCause {
	if (rawCount === 0) { return 'upstream-empty'; }
	if (tableSet.length === 0 && hasOther) { return 'all-other'; }
	return null;
}

/** Assemble a `TableSizeDerived` from raw records + current time range.
 *  `alignMs` — see computeBucketMs; StorageTab passes the tab's bucketMs so
 *  the trend's bucket grid coincides with the metric panels'. */
export function buildDerived(raw: TableSizeRecord[], range: TimeRange, alignMs?: number): TableSizeDerived {
	const normalized = dedupRecords(normalizeRecords(raw));
	const { tableSet, hasOther, otherMembers } = computeTableSet(normalized);
	const byNode = computeSnapshot(normalized, tableSet, hasOther);
	const trend = computeTrendFactory(normalized, range, alignMs);
	const emptyCause = computeEmptyCause(raw.length, tableSet, hasOther);

	// Content signature: window + a cheap digest of the raw input.
	const maxId = raw.reduce((m, r) => (r.id > m ? r.id : m), 0);
	const signature = `${range.startTime}:${range.endTime}:${raw.length}:${maxId}`;

	return {
		snapshot: { byNode, tableSet, hasOther, otherMembers },
		trend,
		defaultSelection: (rankBy: RankBy) => computeDefaultSelection(normalized, rankBy),
		emptyCause,
		signature,
	};
}

export interface SelectionResolution {
	nextTable: string | null;
	nextManual: boolean;
}

/**
 * Decide what `selectedTable` / `manualSelection` should become given the
 * previous values and the latest derived data. Pure function, so the logic
 * can be unit-tested without a React harness.
 *
 * Rules:
 *  - If the user's manual pick is still in `tableSet`, keep it.
 *  - Otherwise fall back to `defaultSelection(rankBy)` and clear manual.
 */
export function resolveSelection(input: {
	prev: string | null;
	snapshot: Snapshot;
	rankBy: RankBy;
	isManual: boolean;
	defaultSelection: (rankBy: RankBy) => string | null;
}): SelectionResolution {
	const { prev, snapshot, rankBy, isManual, defaultSelection } = input;
	const stillPresent = prev !== null && snapshot.tableSet.includes(prev);
	if (isManual && stillPresent) {
		return { nextTable: prev, nextManual: true };
	}
	return { nextTable: defaultSelection(rankBy), nextManual: false };
}

export interface EmptyStateFlags {
	/** Render the ChartPanel's generic empty state (no data from upstream). */
	isEmpty: boolean;
	/** Render the snapshot's "all tables are small" inline hint in place of the chart. */
	allOtherHint: boolean;
}

/** Map `emptyCause` to the UI flags both panels consume. Pure for testability. */
export function emptyCauseToFlags(cause: EmptyCause): EmptyStateFlags {
	return {
		isEmpty: cause === 'upstream-empty',
		allOtherHint: cause === 'all-other',
	};
}

/**
 * Compute the legend growth annotation for a single node across a trend's
 * points. `windowMs` is the panel's requested range (not the samples' span)
 * so the `/hr` rate reflects the user-selected window.
 *
 * Returns an empty string when the annotation wouldn't be meaningful:
 *  - fewer than 2 samples
 *  - no observed change (delta ≤ 0)
 *  - windowMs ≤ 0 (inverted or zero-width range)
 */
export function computeGrowthAnnotation(input: {
	points: Array<{ time: number; values: Record<string, number> }>;
	node: string;
	windowMs: number;
	rankBy: RankBy;
	formatBytes: (bytes: number) => string;
}): string {
	const { points, node, windowMs, rankBy, formatBytes } = input;
	const samples = points
		.map((p) => p.values[node])
		.filter((v): v is number => typeof v === 'number');
	if (samples.length < 2) { return ''; }
	let min = samples[0];
	let max = samples[0];
	for (const v of samples) {
		if (v < min) { min = v; }
		if (v > max) { max = v; }
	}
	const delta = max - min;
	if (delta <= 0) { return ''; }
	if (rankBy === 'percent') {
		const pct = max > 0 ? (delta / max) * 100 : 0;
		return `+${pct.toFixed(1)}%/window`;
	}
	if (windowMs <= 0) { return ''; }
	const hours = windowMs / (1000 * 60 * 60);
	const perHr = delta / hours;
	return `+${formatBytes(delta)} (${formatBytes(perHr)}/hr)`;
}
