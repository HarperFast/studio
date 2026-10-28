import { Button } from '@/components/ui/button';
import { PastRegionCost } from '@/features/cluster/components/CycleCost';
import { METERED_ORDER, toMeter, UsageMeter } from '@/features/cluster/components/UsageMeter';
import { CollapsibleCard, HeaderText } from '@/features/cluster/usage/CollapsibleCard';
import { CycleCostChart, showsCostChart } from '@/features/cluster/usage/CycleCostChart';
import { cycleRange } from '@/features/cluster/usage/cycleRange';
import { formatCycleDate } from '@/integrations/api/cluster/getClusterUsage';
import {
	type PastCycle,
	type PastCycleRegion,
	useClusterUsageHistory,
} from '@/integrations/api/cluster/getClusterUsageHistory';
import { toUSD } from '@/lib/toUSD';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

const cycleElementId = (endsAt: string) => `past-cycle-${endsAt}`;

export function PastCycles({ clusterId }: { clusterId: string }) {
	const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } =
		useClusterUsageHistory(clusterId);
	const cycles = data?.pages.flatMap((page) => page.cycles) ?? [];
	const unplacedBlockCount = data?.pages[0]?.unplacedBlockCount ?? 0;
	const [openCycles, setOpenCycles] = useState<ReadonlySet<string>>(() => new Set());
	const setCycleOpen = (endsAt: string, open: boolean) =>
		setOpenCycles((current) => {
			const next = new Set(current);
			if (open) { next.add(endsAt); }
			else { next.delete(endsAt); }
			return next;
		});
	const selectCycle = (endsAt: string) => {
		setCycleOpen(endsAt, true);
		requestAnimationFrame(() =>
			document.getElementById(cycleElementId(endsAt))?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
		);
	};

	return (
		<section aria-label="Billing history" className="mt-10">
			<h2 className="text-lg font-light text-foreground">Billing history</h2>
			<p className="mt-0.5 text-sm text-muted-foreground">Plan charges and overages by cycle</p>
			{isLoading
				? (
					<div className="flex justify-center py-8 text-muted-foreground">
						<Loader2 className="size-5 animate-spin" />
					</div>
				)
				: !data
				? <p className="mt-2 text-sm text-destructive">Couldn&rsquo;t load billing history — refresh to try again.</p>
				: (
					<div className="mt-3 space-y-3">
						{cycles.length === 0 && !hasNextPage && unplacedBlockCount === 0 && (
							<p className="text-sm text-muted-foreground">No billing cycle has ended yet.</p>
						)}
						{showsCostChart(cycles) && <CycleCostChart cycles={cycles} onSelect={selectCycle} />}
						{cycles.map((cycle) => (
							<PastCycleCard
								key={cycle.endsAt}
								cycle={cycle}
								open={openCycles.has(cycle.endsAt)}
								onOpenChange={(open) => setCycleOpen(cycle.endsAt, open)}
							/>
						))}
						{hasNextPage && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={isFetchingNextPage}
								onClick={() => fetchNextPage()}
							>
								{isFetchingNextPage ? 'Loading…' : 'Show older cycles'}
							</Button>
						)}
						{isFetchNextPageError && !isFetchingNextPage && (
							<p className="text-sm text-destructive">Couldn&rsquo;t load older cycles — try again.</p>
						)}
						{unplacedBlockCount > 0 && (
							<p className="text-sm text-muted-foreground">
								Some earlier usage couldn&rsquo;t be matched to a billing cycle, so it isn&rsquo;t shown here.
							</p>
						)}
					</div>
				)}
		</section>
	);
}

function PastCycleCard(
	{ cycle, open, onOpenChange }: { cycle: PastCycle; open: boolean; onOpenChange: (open: boolean) => void },
) {
	const meta = [
		cycle.cycleUsd > 0 ? `${cycle.estimated ? '≈ ' : ''}${toUSD(cycle.cycleUsd)} in charges` : null,
		cycle.overageUsd > 0 ? `${toUSD(cycle.overageUsd)} of it overage` : null,
		cycle.regions.map((region) => region.region ?? 'Region').join(', '),
	].filter(Boolean).join(' · ');
	return (
		<CollapsibleCard
			id={cycleElementId(cycle.endsAt)}
			open={open}
			onOpenChange={onOpenChange}
			header={<HeaderText title={cycleRange(cycle)} meta={meta} />}
		>
			<div className="space-y-6">
				{cycle.regions.map((region) => <PastRegion key={region.region ?? region.regionIds.join()} region={region} />)}
			</div>
		</CollapsibleCard>
	);
}

function PastRegion({ region }: { region: PastCycleRegion }) {
	const cause = region.overageCause;
	const meters = METERED_ORDER.filter((key) => key !== 'storageBytes').map((key) => ({
		...toMeter(key, region.metrics[key as keyof PastCycleRegion['metrics']]),
		note: cause?.metric === key && cause.ranOutAt ? `ran out ${formatCycleDate(cause.ranOutAt)}` : undefined,
	}));
	return (
		<div>
			<h3 className="text-sm font-medium text-foreground">
				{region.region ?? 'Region'}
				{region.planNames.length > 0 && (
					<span className="ml-2 font-normal text-muted-foreground">
						{region.planNames.join(' → ')} plan
					</span>
				)}
			</h3>
			<div className="mt-3 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
				{meters.map((meter) => <UsageMeter key={meter.label} {...meter} />)}
			</div>
			<PastRegionCost region={region} />
		</div>
	);
}
