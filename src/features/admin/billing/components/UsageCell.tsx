import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FleetUsageCluster } from '@/features/admin/billing/queries/getFleetUsage';
import { METRIC_FORMAT, METRIC_LABEL } from '@/features/cluster/components/UsageMeter';
import { cn } from '@/lib/cn';

/** Where a meter stops being informational and starts being a thing to act on. */
const WARN_AT = 0.75;
const FULL_AT = 1;

const pct = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 });

/**
 * How close this cluster is to its tightest ceiling.
 *
 * `mostConstrained` is the server's single tightest region×metric — quota is enforced per region, so
 * there is no cluster-wide percentage to show and deriving one would invent a number. Storage is
 * excluded from it server-side: it is disk fill, not a quota.
 */
export function UsageCell({ usage }: { usage: FleetUsageCluster | undefined }) {
	if (!usage) { return <span className="text-muted-foreground">—</span>; }
	// A self-hosted cluster runs under its own license, so there is nothing metered to report.
	if (usage.selfManaged) { return <span className="text-xs text-muted-foreground">self-hosted</span>; }

	const top = usage.mostConstrained;
	if (!top) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="text-xs text-muted-foreground">no ceiling</span>
				</TooltipTrigger>
				<TooltipContent>Nothing metered has a known, finite limit on this cluster's plans.</TooltipContent>
			</Tooltip>
		);
	}

	const ratio = top.utilization;
	const tone = ratio >= FULL_AT ? 'bg-destructive' : ratio >= WARN_AT ? 'bg-yellow' : 'bg-green';

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="flex w-32 items-center gap-2">
					<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
						<div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
					</div>
					<span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{pct.format(ratio)}</span>
				</div>
			</TooltipTrigger>
			<TooltipContent>
				{METRIC_LABEL[top.metric]} in {top.region ?? 'its region'} — {METRIC_FORMAT[top.metric](top.used)} of{' '}
				{METRIC_FORMAT[top.metric](top.limit)}
			</TooltipContent>
		</Tooltip>
	);
}
