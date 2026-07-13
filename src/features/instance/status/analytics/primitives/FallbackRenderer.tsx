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
	/** Unused by this renderer — accepted (optionally) only because
	 *  MetricRenderer's callsites still pass them; drop from both sides when
	 *  those callsites are next touched. */
	window?: TimeRange;
	nodes?: string[];
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

/** Pure panel construction, exported for tests. Records lacking a numeric
 *  `time` are dropped — mapping them to x=0 plotted at 1970 and dragged the
 *  chart's x-domain back 56 years. */
export function buildFallbackPanels(
	records: AnalyticsDataPoint[],
): { panels: { title: string; data: SeriesData }[]; overflowCount: number } {
	const fields = inferNumericFields(records);
	const visibleFields = fields.slice(0, MAX_FALLBACK_PANELS);
	const panels = visibleFields.map((field) => {
		const data: SeriesData = {
			series: [
				{
					key: field,
					label: field,
					points: records
						.filter((r) => typeof r[field] === 'number' && typeof r.time === 'number')
						.map((r) => ({
							x: r.time,
							y: r[field] as number,
						})),
				},
			],
		};
		return { title: field, data };
	});
	return { panels, overflowCount: fields.length - visibleFields.length };
}

export function FallbackRenderer({ metric, records, hint }: Props) {
	const { panels, overflowCount: overflow } = buildFallbackPanels(records);

	const kebab = metric.replace(/_/g, '-');
	const banner = isDev
		? `Unspecced metric "${metric}" — add a spec at src/features/instance/status/analytics/pipeline/${kebab}.tsx for a tailored view.`
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
			<SmallMultiples panels={panels} />
			{overflow > 0 && (
				<div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>
					{`… and ${overflow} more fields not shown. Add a spec at src/features/instance/status/analytics/pipeline/${kebab}.tsx to customize.`}
				</div>
			)}
		</div>
	);
}
