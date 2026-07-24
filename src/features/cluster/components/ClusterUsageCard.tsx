import { fmtBytes, fmtCount, fmtHours, UsageMeter, UsageMetric } from '@/features/cluster/components/UsageMeter';
import { usageSubtitle, useClusterUsage } from '@/integrations/api/cluster/getClusterUsage';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

// Plan-usage summary on the managed cluster overview (issue #1297). Framing is "used X of Y this
// cycle": purchased blocks auto-renew and re-bill on exhaustion for paid tiers, while for the free
// tier the same bar doubles as the hard-limit warning. Shows only the four headline metrics; the
// full breakdown lives on the Usage tab.

export function ClusterUsageCard({ clusterId, base }: { clusterId: string; base: string }) {
	const { data } = useClusterUsage(clusterId);

	// Nothing to show until there's an active plan with recorded usage (also covers loading, errors,
	// and self-hosted clusters, which report no totals).
	if (!data || data.selfManaged || !data.totals) { return null; }

	const { totals } = data;
	const metrics: UsageMetric[] = [
		{ label: 'Reads', used: totals.reads.used, limit: totals.reads.limit, format: fmtCount },
		{ label: 'Writes', used: totals.writes.used, limit: totals.writes.limit, format: fmtCount },
		{ label: 'Storage', used: totals.storageBytes.used, limit: totals.storageBytes.limit, format: fmtBytes },
		{ label: 'Compute', used: totals.cpuTimeHours.used, limit: totals.cpuTimeHours.limit, format: fmtHours },
	];

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

			<div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
				{metrics.map((m) => <UsageMeter key={m.label} {...m} />)}
			</div>
		</section>
	);
}
