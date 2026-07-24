import { humanFileSize } from '@/lib/humanFileSize';

// Shared usage-meter primitive for the cluster Plan-usage card and Usage tab (issue #1297).
// Framing: "used X of Y this cycle". `limit === null` means the plan allows unlimited
// (the server sends -1), rendered as a hatched track + "Unlimited" rather than a percentage.

export interface UsageMetric {
	label: string;
	used: number;
	/** null → unlimited (plan limit is -1) */
	limit: number | null;
	format: (n: number) => string;
}

export const fmtCount = (n: number) =>
	new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export const fmtHours = (n: number) => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n)} hr`;
export const fmtBytes = (n: number) => humanFileSize(n);

export function UsageMeter({ label, used, limit, format }: UsageMetric) {
	// Treat a negative limit as unlimited too — the server uses -1 for that, so the meter stays correct
	// even if a raw response reaches it without -1 being mapped to null. Guard limit === 0 so the
	// percentage never divides by zero (which would render NaN and break the bar).
	const unlimited = limit === null || limit < 0;
	const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
	const warn = pct >= 90;

	return (
		<div>
			<div className="flex items-baseline justify-between gap-2 text-sm">
				<span className="text-foreground">{label}</span>
				<span className="text-muted-foreground tabular-nums">
					<span className="text-foreground">{format(used)}</span>
					{unlimited ? ' used' : <>/ {format(limit)}</>}
				</span>
			</div>
			<div className="mt-1.5 flex items-center gap-2">
				<div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
					{unlimited
						? (
							// Diagonal hatching stands in for "no ceiling". `--color-border` is too close to the
							// track in dark mode, so give dark its own brighter stripe; bands are widened for legibility.
							<div className="h-full w-full bg-[repeating-linear-gradient(-45deg,transparent,transparent_5px,var(--color-border)_5px,var(--color-border)_9px)] dark:bg-[repeating-linear-gradient(-45deg,transparent,transparent_5px,rgba(255,255,255,0.32)_5px,rgba(255,255,255,0.32)_9px)]" />
						)
						: (
							<div
								className={`h-full rounded-full ${warn ? 'bg-yellow' : 'bg-primary dark:bg-violet-400'}`}
								style={{ width: `${pct}%` }}
							/>
						)}
				</div>
				<span
					className={`w-14 shrink-0 text-right text-xs tabular-nums ${warn ? 'text-yellow' : 'text-muted-foreground'}`}
				>
					{unlimited ? 'Unlimited' : `${pct}%`}
				</span>
			</div>
		</div>
	);
}
