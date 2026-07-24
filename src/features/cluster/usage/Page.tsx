import { ClusterContentWithSubNavMenu } from '@/features/cluster/components/ClusterContentWithSubNavMenu';
import { fmtBytes, fmtCount, fmtHours, UsageMeter, UsageMetric } from '@/features/cluster/components/UsageMeter';
import { addCommasToNumbers } from '@/lib/addCommasToNumbers';
import { humanFileSize } from '@/lib/humanFileSize';
import { ReactNode } from 'react';

// ⚠️ MOCKUP (issue #1297) — placeholder data covering the COMPLETE set of metrics
// central-manager tracks, so we can decide which ones matter on the overview card.
//
// Three tiers of data exist server-side:
//   1. Metered this cycle — PurchasedBlock.used* vs Plan.planLimits.total* (has real usage → bars).
//   2. Rate limits — Plan.planLimits.*PerMinute* + tlsHandshakes (ceilings only, NO usage counter).
//   3. Per-instance resources — Plan.resourcesPerInstance (provisioned capacity, not consumption).

// 1. Metered usage this cycle (used vs limit). Ordered so the count/data pairs sit side-by-side
//    in the 2-col grid. Real-time is left Unlimited to show that state.
const METERED: UsageMetric[] = [
	{ label: 'Reads', used: 9_200_000, limit: 10_000_000, format: fmtCount },
	{ label: 'Read data', used: 45_097_156_608, limit: 53_687_091_200, format: fmtBytes },
	{ label: 'Writes', used: 2_300_000, limit: 5_000_000, format: fmtCount },
	{ label: 'Write data', used: 8_589_934_592, limit: 21_474_836_480, format: fmtBytes },
	{ label: 'Real-time messages', used: 1_412_004, limit: null, format: fmtCount },
	{ label: 'Real-time data', used: 6_442_450_944, limit: null, format: fmtBytes },
	{ label: 'Compute', used: 1.6, limit: 2, format: fmtHours },
	{ label: 'Storage', used: 13_314_398_617, limit: 21_474_836_480, format: fmtBytes },
];

// 2. Rate limits — throttle ceilings, no usage tracked.
const RATE_LIMITS: Array<[string, string]> = [
	['Reads / minute', `${addCommasToNumbers(50_000)}`],
	['Writes / minute', `${addCommasToNumbers(10_000)}`],
	['Real-time deliveries / minute', `${addCommasToNumbers(5_000)}`],
	['TLS handshakes (cycle)', addCommasToNumbers(1_000_000)],
];

// 3. Per-instance provisioned resources (Plan.resourcesPerInstance).
const PER_INSTANCE: Array<[string, string]> = [
	['Storage', humanFileSize(21_474_836_480)],
	['Memory', humanFileSize(4_294_967_296)],
	['vCPU', '2 cores'],
	['Threads', '4'],
];

export function UsagePage() {
	return (
		<ClusterContentWithSubNavMenu className="max-w-4xl">
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<h1 className="text-2xl font-light text-foreground">Usage</h1>
				<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
					Preview · sample data
				</span>
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				Standard plan · this cycle renews Aug 12, 2026 · updated 4 minutes ago
			</p>

			<Section
				title="This cycle"
				subtitle="Consumption against your plan's allotment. Renews (and re-bills) when full."
			>
				<div className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
					{METERED.map((m) => <UsageMeter key={m.label} {...m} />)}
				</div>
			</Section>

			<Section
				title="Rate limits"
				subtitle="Throughput ceilings — not part of the cycle allotment, and not currently metered."
			>
				<InfoGrid rows={RATE_LIMITS} />
			</Section>

			<Section title="Per-instance resources" subtitle="Provisioned capacity on each of your 2 instances.">
				<InfoGrid rows={PER_INSTANCE} />
			</Section>
		</ClusterContentWithSubNavMenu>
	);
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
	return (
		<section className="mt-8">
			<h2 className="text-sm font-medium text-foreground">{title}</h2>
			<p className="mt-0.5 mb-4 text-xs text-muted-foreground">{subtitle}</p>
			{children}
		</section>
	);
}

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
	return (
		<dl className="grid grid-cols-1 gap-x-10 gap-y-2 sm:grid-cols-2">
			{rows.map(([label, value]) => (
				<div key={label} className="flex items-baseline justify-between gap-2 border-b border-border/60 py-1.5 text-sm">
					<dt className="text-muted-foreground">{label}</dt>
					<dd className="text-foreground tabular-nums">{value}</dd>
				</div>
			))}
		</dl>
	);
}
