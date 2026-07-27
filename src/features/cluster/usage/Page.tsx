import { ClusterContentWithSubNavMenu } from '@/features/cluster/components/ClusterContentWithSubNavMenu';
import { METERED_ORDER, toMeter, UsageMeter } from '@/features/cluster/components/UsageMeter';
import { ClusterUsageRegion, usageSubtitle, useClusterUsage } from '@/integrations/api/cluster/getClusterUsage';
import { addCommasToNumbers } from '@/lib/addCommasToNumbers';
import { humanFileSize } from '@/lib/humanFileSize';
import { useParams } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { ReactNode } from 'react';

export function UsagePage() {
	const { clusterId } = useParams({ strict: false }) as { clusterId?: string };
	const { data, isLoading } = useClusterUsage(clusterId);

	return (
		<ClusterContentWithSubNavMenu className="max-w-4xl">
			<h1 className="text-2xl font-light text-foreground">Usage</h1>
			{isLoading
				? (
					<div className="flex justify-center py-16 text-muted-foreground">
						<Loader2 className="size-6 animate-spin" />
					</div>
				)
				: data?.selfManaged
				? <Empty>Usage isn't tracked for self-hosted clusters — they run under their own license.</Empty>
				: !data || data.regions.length === 0
				? <Empty>No usage has been recorded for the current cycle yet.</Empty>
				: (
					<>
						<p className="mt-1 text-sm text-muted-foreground">{usageSubtitle(data)}</p>
						{/* Quota is enforced per region — each region is its own set of meters. */}
						{data.regions.map((region) => (
							<RegionSection key={region.region ?? region.regionIds.join()} region={region} />
						))}
					</>
				)}
		</ClusterContentWithSubNavMenu>
	);
}

function RegionSection({ region }: { region: ClusterUsageRegion }) {
	const meters = METERED_ORDER.map((key) => toMeter(key, region.metrics[key]));

	const rl = region.rateLimits;
	const rateRows = rl
		? rowsFrom([
			['Reads / minute', rl.readsPerMinute, addCommasToNumbers],
			['Writes / minute', rl.writesPerMinute, addCommasToNumbers],
			['Real-time deliveries / minute', rl.realTimeDeliveriesPerMinute, addCommasToNumbers],
			['TLS handshakes (cycle)', rl.tlsHandshakes, addCommasToNumbers],
		])
		: [];

	const rpi = region.resourcesPerInstance;
	const perInstanceRows = rpi
		? rowsFrom([
			['Storage', rpi.storageGb, (n) => `${addCommasToNumbers(n)} GB`],
			['Memory', rpi.memoryMb, (n) => humanFileSize(n * 1024 * 1024)],
			['vCPU', rpi.cpuCores, (n) => `${n} ${n === 1 ? 'core' : 'cores'}`],
			['Threads', rpi.threads, (n) => String(n)],
		])
		: [];

	return (
		<section className="mt-8 border-t border-border/60 pt-6 first:border-t-0 first:pt-0">
			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<h2 className="text-base font-medium text-foreground">{region.region ?? 'Region'}</h2>
				{region.exhausted && (
					<span className="rounded-full bg-yellow/10 px-2 py-0.5 text-[11px] text-yellow">Cycle exhausted</span>
				)}
			</div>
			<p className="mt-0.5 mb-4 text-xs text-muted-foreground">
				{[
					region.planName ? `${region.planName} plan` : null,
					region.exhausted
						? 'consumed — awaiting renewal'
						: region.expiresAt
						? `renews ${fmtDate(region.expiresAt)}`
						: null,
				].filter(Boolean).join(' · ')}
			</p>

			<div className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
				{meters.map((meter) => <UsageMeter key={meter.label} {...meter} />)}
			</div>

			{rateRows.length > 0 && (
				<SubSection
					title="Rate limits"
					subtitle="Throughput ceilings — not part of the cycle allotment, and not metered."
				>
					<InfoGrid rows={rateRows} />
				</SubSection>
			)}

			{perInstanceRows.length > 0 && (
				<SubSection title="Per-instance resources" subtitle="Provisioned capacity on each instance.">
					<InfoGrid rows={perInstanceRows} />
				</SubSection>
			)}
		</section>
	);
}

function fmtDate(iso: string): string {
	return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(iso));
}

// Build label/value rows, dropping any metric the plan didn't declare (null/undefined).
function rowsFrom(
	entries: Array<[string, number | null | undefined, (n: number) => string]>,
): Array<[string, string]> {
	return entries
		.filter((e): e is [string, number, (n: number) => string] => e[1] != null)
		.map(([label, value, format]): [string, string] => [label, format(value)]);
}

function Empty({ children }: { children: ReactNode }) {
	return <p className="mt-3 text-sm text-muted-foreground">{children}</p>;
}

function SubSection({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
	return (
		<div className="mt-6">
			<h3 className="text-sm font-medium text-foreground">{title}</h3>
			<p className="mt-0.5 mb-3 text-xs text-muted-foreground">{subtitle}</p>
			{children}
		</div>
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
