import { fmtBytes, fmtCount, fmtHours, UsageMeter, UsageMetric } from '@/features/cluster/components/UsageMeter';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

// ⚠️ MOCKUP — placeholder data, not wired to an API yet (issue #1297).
// Shape mirrors the planned `GET /Cluster/:id/usage` response so this drops
// straight onto real data later. Framing per product decision: "used X of Y
// this cycle" (blocks auto-renew & re-bill on exhaustion for paid tiers; for
// the free tier the same bar doubles as the hard-limit warning).

// Sample data — a mid-usage "Standard" cluster, with Reads pushed near the cap
// to show the warning state. The overview card shows only the four headline
// metrics; the full list lives on the Usage tab.
const SAMPLE: UsageMetric[] = [
	{ label: 'Reads', used: 9_200_000, limit: 10_000_000, format: fmtCount },
	{ label: 'Writes', used: 2_300_000, limit: 5_000_000, format: fmtCount },
	{ label: 'Storage', used: 13_314_398_617, limit: 21_474_836_480, format: fmtBytes },
	{ label: 'Compute', used: 1.6, limit: 2, format: fmtHours },
];

export function ClusterUsageCard({ base }: { base: string }) {
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
			<p className="mt-0.5 text-xs text-muted-foreground">
				Standard plan · this cycle renews Aug 12 · updated 4 min ago
			</p>

			<div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
				{SAMPLE.map((m) => <UsageMeter key={m.label} {...m} />)}
			</div>
		</section>
	);
}
