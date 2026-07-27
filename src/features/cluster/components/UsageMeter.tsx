import type { UsageMetricKey, UsageValue } from '@/integrations/api/cluster/getClusterUsage';
import { humanFileSize } from '@/lib/humanFileSize';

// Shared usage-meter primitive for the cluster Plan-usage card and Usage tab (issue #1297).
// Framing: "used X of Y this cycle". Three ceiling states, mirroring the endpoint's per-metric shape:
//   unlimited        → plan grants no ceiling (-1); hatched bar + "Unlimited".
//   !limitKnown      → the plan couldn't be resolved; no bar + "—" (never shown as reassuring Unlimited).
//   finite limit     → normal used/limit meter, amber ≥90%.

export interface UsageMetric {
	label: string;
	used: number;
	limit: number | null;
	unlimited: boolean;
	limitKnown: boolean;
	format: (n: number) => string;
}

export const fmtCount = (n: number) =>
	new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export const fmtHours = (n: number) => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n)} hr`;
export const fmtBytes = (n: number) => humanFileSize(n);

// Display metadata keyed by the endpoint's metric keys, shared by the card + tab.
export const METRIC_LABEL: Record<UsageMetricKey, string> = {
	reads: 'Reads',
	readBytes: 'Read data',
	writes: 'Writes',
	writeBytes: 'Write data',
	realTimeMessages: 'Real-time messages',
	realTimeBytes: 'Real-time data',
	cpuTimeHours: 'Compute',
	storageBytes: 'Storage',
};

export const METRIC_FORMAT: Record<UsageMetricKey, (n: number) => string> = {
	reads: fmtCount,
	readBytes: fmtBytes,
	writes: fmtCount,
	writeBytes: fmtBytes,
	realTimeMessages: fmtCount,
	realTimeBytes: fmtBytes,
	cpuTimeHours: fmtHours,
	storageBytes: fmtBytes,
};

// Order the full breakdown shows, count/data pairs adjacent.
export const METERED_ORDER: UsageMetricKey[] = [
	'reads',
	'readBytes',
	'writes',
	'writeBytes',
	'realTimeMessages',
	'realTimeBytes',
	'cpuTimeHours',
	'storageBytes',
];

export function toMeter(key: UsageMetricKey, value: UsageValue, labelOverride?: string): UsageMetric {
	return {
		label: labelOverride ?? METRIC_LABEL[key],
		used: value.used,
		limit: value.limit,
		unlimited: value.unlimited,
		limitKnown: value.limitKnown,
		format: METRIC_FORMAT[key],
	};
}

export function UsageMeter({ label, used, limit, unlimited, limitKnown, format }: UsageMetric) {
	// Defensive: a negative limit is also "unlimited" (server sentinel), and a null/0 finite limit can't
	// be a denominator — treat as unknown so we never divide by zero (NaN) or invent a ceiling.
	const isUnlimited = unlimited || (limit != null && limit < 0);
	const isKnown = limitKnown && !isUnlimited && limit != null && limit > 0;
	const pct = isKnown ? Math.min(100, Math.round((used / limit) * 100)) : 0;
	const warn = pct >= 90;

	return (
		<div>
			<div className="flex items-baseline justify-between gap-2 text-sm">
				<span className="text-foreground">{label}</span>
				<span className="text-muted-foreground tabular-nums">
					<span className="text-foreground">{format(used)}</span>
					{isKnown ? <>/ {format(limit)}</> : ' used'}
				</span>
			</div>
			<div className="mt-1.5 flex items-center gap-2">
				<div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
					{isKnown
						? (
							<div
								className={`h-full rounded-full ${warn ? 'bg-yellow' : 'bg-primary dark:bg-violet-400'}`}
								style={{ width: `${pct}%` }}
							/>
						)
						: isUnlimited
						? (
							// Diagonal hatching stands in for "no ceiling". `--color-border` is too close to the
							// track in dark mode, so give dark its own brighter stripe; bands widened for legibility.
							<div className="h-full w-full bg-[repeating-linear-gradient(-45deg,transparent,transparent_5px,var(--color-border)_5px,var(--color-border)_9px)] dark:bg-[repeating-linear-gradient(-45deg,transparent,transparent_5px,rgba(255,255,255,0.32)_5px,rgba(255,255,255,0.32)_9px)]" />
						)
						// Unknown limit: leave the track empty rather than imply either a full bar or unlimited.
						: null}
				</div>
				<span
					className={`w-16 shrink-0 text-right text-xs tabular-nums ${warn ? 'text-yellow' : 'text-muted-foreground'}`}
				>
					{isKnown ? `${pct}%` : isUnlimited ? 'Unlimited' : '—'}
				</span>
			</div>
		</div>
	);
}
