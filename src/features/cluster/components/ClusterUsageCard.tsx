import { METRIC_LABEL, toMeter, UsageMeter, UsageMetric } from '@/features/cluster/components/UsageMeter';
import { ClusterUsage, usageSubtitle, useClusterUsage } from '@/integrations/api/cluster/getClusterUsage';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

// Plan-usage summary on the managed cluster overview (issue #1297). Quota is per region, so:
//   • one region  → the four headline meters for that region.
//   • many regions → the single most-constrained region×metric (an average would hide a hot region),
//     with the full per-region breakdown a click away on the Usage tab.

export function ClusterUsageCard({ clusterId, base }: { clusterId: string; base: string }) {
	const { data } = useClusterUsage(clusterId);

	// Nothing to show until there's a managed plan with reportable regions (also covers loading, errors,
	// and self-hosted clusters).
	if (!data || data.selfManaged || data.regions.length === 0) { return null; }

	return (
		<section className="mt-6 rounded-2xl border border-border bg-card p-5">
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-sm font-medium text-foreground">Plan usage</h2>
				<Link
					to={`${base}/usage`}
					className="inline-flex items-center gap-1 text-xs text-primary hover:underline dark:text-violet-300"
				>
					View all usage <ArrowRight className="size-3" />
				</Link>
			</div>
			<p className="mt-0.5 text-xs text-muted-foreground">{usageSubtitle(data)}</p>

			<div className="mt-4">
				{data.regions.length === 1 ? <SingleRegion data={data} /> : <MultiRegion data={data} />}
			</div>
		</section>
	);
}

function SingleRegion({ data }: { data: ClusterUsage }) {
	const m = data.regions[0].metrics;
	const meters: UsageMetric[] = [
		toMeter('reads', m.reads),
		toMeter('writes', m.writes),
		toMeter('storageBytes', m.storageBytes),
		toMeter('cpuTimeHours', m.cpuTimeHours),
	];
	return (
		<div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
			{meters.map((meter) => <UsageMeter key={meter.label} {...meter} />)}
		</div>
	);
}

function MultiRegion({ data }: { data: ClusterUsage }) {
	const mc = data.mostConstrained;
	return (
		<div>
			<p className="mb-1.5 text-xs text-muted-foreground">Most constrained of {data.regions.length} regions</p>
			{mc
				? (
					<UsageMeter
						{...toMeter(
							mc.metric,
							{ used: mc.used, limit: mc.limit, unlimited: false, limitKnown: true },
							`${mc.region} · ${METRIC_LABEL[mc.metric]}`,
						)}
					/>
				)
				: (
					<p className="text-sm text-muted-foreground">
						No metered limits on the current plan — see the breakdown for details.
					</p>
				)}
		</div>
	);
}
