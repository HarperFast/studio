import type { AnalyticsDataPoint, SeriesData, TimeRange } from '../types/analytics.ts';
import { SmallMultiples } from './SmallMultiples.tsx';

const isDev = import.meta.env?.DEV ?? false;

const RESERVED_FIELDS = new Set([
	'time',
	'node',
	'id',
	'period',
	'metric',
	// Dimensional / metadata fields that should not be rendered as numeric
	// series even when they happen to be numeric (e.g. tls-reused.path = 9926).
	'count',
	'threadId',
	'path',
	'method',
	'type',
	'database',
	'table',
	'source',
]);

const MAX_FALLBACK_PANELS = 8;

interface Props {
	metric: string;
	records: AnalyticsDataPoint[];
	window: TimeRange;
	nodes: string[];
	theme: 'light' | 'dark';
	/** Optional inline banner shown above the dev hint — used by callers that
	 *  fell through to FallbackRenderer for a known reason (e.g. legacy chart
	 *  failed to load), so users see the cause. */
	hint?: string;
}

function inferNumericFields(records: AnalyticsDataPoint[]): string[] {
	const candidates = new Map<string, number>();
	for (const r of records) {
		for (const key of Object.keys(r)) {
			if (RESERVED_FIELDS.has(key)) { continue; }
			if (typeof r[key] === 'number' && Number.isFinite(r[key] as number)) {
				candidates.set(key, (candidates.get(key) ?? 0) + 1);
			}
		}
	}
	// Keep fields that appeared numeric in at least half the records.
	const half = Math.max(1, Math.floor(records.length / 2));
	return [...candidates.entries()]
		.filter(([, count]) => count >= half)
		.map(([key]) => key);
}

export function FallbackRenderer({ metric, records, theme, hint }: Props) {
	const fields = inferNumericFields(records);
	const visibleFields = fields.slice(0, MAX_FALLBACK_PANELS);
	const overflow = fields.length - visibleFields.length;

	const panels = visibleFields.map((field) => {
		const data: SeriesData = {
			series: [
				{
					key: field,
					label: field,
					points: records
						.filter((r) => typeof r[field] === 'number')
						.map((r) => ({
							x: typeof r.time === 'number' ? r.time : 0,
							y: r[field] as number,
						})),
				},
			],
		};
		return { title: field, data };
	});

	const kebab = metric.replace(/_/g, '-');
	const banner = isDev
		? `Unspecced metric "${metric}" — add a spec at src/lib/metricSpecs/${kebab}.ts for a tailored view.`
		: null;

	return (
		<div>
			{hint && (
				<div
					role="status"
					style={{
						fontSize: 12,
						padding: '4px 8px',
						marginBottom: 8,
						background: 'color-mix(in srgb, var(--color-text-secondary) 10%, transparent)',
						color: 'var(--color-text-secondary)',
						border: '1px solid color-mix(in srgb, var(--color-text-secondary) 30%, transparent)',
						borderRadius: 4,
					}}
				>
					{hint}
				</div>
			)}
			{banner && (
				<div
					role="status"
					style={{
						fontSize: 12,
						padding: '4px 8px',
						marginBottom: 8,
						background: 'color-mix(in srgb, var(--color-warning) 15%, transparent)',
						color: 'var(--color-warning)',
						border: '1px solid color-mix(in srgb, var(--color-warning) 40%, transparent)',
						borderRadius: 4,
					}}
				>
					{banner}
				</div>
			)}
			<SmallMultiples panels={panels} theme={theme} />
			{overflow > 0 && (
				<div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>
					{`… and ${overflow} more fields not shown. Add a spec at src/lib/metricSpecs/${kebab}.ts to customize.`}
				</div>
			)}
		</div>
	);
}
