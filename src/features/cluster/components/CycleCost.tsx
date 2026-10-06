import { type ClusterUsageRegion, formatCycleDate } from '@/integrations/api/cluster/getClusterUsage';
import { toUSD } from '@/lib/toUSD';

/**
 * What a region has cost this cycle so far, the plan and the overage broken out. Nothing for a region
 * that is never billed: its cycle total is 0, and "$0.00" would read as a free plan.
 */
export function RegionCycleCost({ region }: { region: ClusterUsageRegion }) {
	if (!((region.cycleUsd ?? 0) > 0)) { return null; }
	const topUps = region.topUpCount ?? 0;
	return (
		<dl className="mt-5 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
			<div className="flex items-baseline justify-between gap-3">
				<dt className="font-medium text-foreground">This cycle so far</dt>
				<dd className="font-medium text-foreground tabular-nums">{toUSD(region.cycleUsd ?? 0)}</dd>
			</div>
			<div className="mt-1.5 flex items-baseline justify-between gap-3 text-muted-foreground">
				<dt>Plan</dt>
				<dd className="tabular-nums">{toUSD(region.planUsd ?? 0)}</dd>
			</div>
			{topUps > 0 && (
				<>
					<div className="mt-1 flex items-baseline justify-between gap-3 text-muted-foreground">
						<dt>Overage</dt>
						<dd className="tabular-nums">{toUSD(region.overageUsd ?? 0)}</dd>
					</div>
					<p className="mt-1.5 text-xs text-muted-foreground">
						{overageDetail(topUps, region.overageSince ?? null, region.expiresAt)}
					</p>
				</>
			)}
		</dl>
	);
}

function overageDetail(topUps: number, since: string | null, renewsAt: string | null): string {
	return [
		`${topUps} ${topUps === 1 ? 'top-up' : 'top-ups'}${since ? ` since ${formatCycleDate(since)}` : ''}`,
		renewsAt ? `billed at renewal on ${formatCycleDate(renewsAt)}` : 'billed at renewal',
	].join(' · ');
}

/** The cluster's cost this cycle so far as the page's headline figure, the plan and overage beneath it. */
export function ClusterCycleCost(
	{ usage }: { usage: { planUsd?: number; overageUsd?: number; cycleUsd?: number } },
) {
	if (!((usage.cycleUsd ?? 0) > 0)) { return null; }
	const overage = usage.overageUsd ?? 0;
	return (
		<section aria-label="This cycle so far" className="mt-4 rounded-xl border border-border bg-muted/30 px-5 py-4">
			<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">This cycle so far</p>
			<p className="mt-1 text-3xl font-light text-foreground tabular-nums">{toUSD(usage.cycleUsd ?? 0)}</p>
			<p className="mt-1 text-sm text-muted-foreground">
				{toUSD(usage.planUsd ?? 0)} plan{overage > 0 ? ` + ${toUSD(overage)} overage, billed at renewal` : ''}
			</p>
		</section>
	);
}

export function cycleCostSummary(
	{ cycleUsd, overageUsd }: { cycleUsd?: number; overageUsd?: number },
): string | null {
	if (!((cycleUsd ?? 0) > 0)) { return null; }
	const overage = overageUsd ?? 0;
	return `${toUSD(cycleUsd ?? 0)} this cycle so far${overage > 0 ? `, ${toUSD(overage)} of it overage` : ''}`;
}
