// Single source of truth for the percentile field set Harper exposes on
// quantile-bearing metrics (duration, transfer, db-*, cpu-usage, bytes-*,
// replication-latency). All 9 percentiles are surfaced to operators so
// they can inspect the full distribution shape from p1 (best case) to
// p999 (worst tail). Default selection is p95 — the historical SLO axis.

export interface QuantileField {
	/** Record column to read. Harper uses 'median' for p50. */
	field: 'p1' | 'p10' | 'p25' | 'median' | 'p75' | 'p90' | 'p95' | 'p99' | 'p999';
	/** Operator-facing label. */
	label: string;
}

export const QUANTILE_FIELDS: ReadonlyArray<QuantileField> = [
	{ field: 'p1', label: 'p1' },
	{ field: 'p10', label: 'p10' },
	{ field: 'p25', label: 'p25' },
	{ field: 'median', label: 'p50' },
	{ field: 'p75', label: 'p75' },
	{ field: 'p90', label: 'p90' },
	{ field: 'p95', label: 'p95' },
	{ field: 'p99', label: 'p99' },
	{ field: 'p999', label: 'p999' },
];

export const QUANTILE_DEFAULT: QuantileField['field'] = 'p95';
