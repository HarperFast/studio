import { ClusterContentWithSubNavMenu } from '@/features/cluster/components/ClusterContentWithSubNavMenu';
import { fmtBytes, fmtCount, fmtHours, UsageMeter, UsageMetric } from '@/features/cluster/components/UsageMeter';
import { ClusterUsage, usageSubtitle, useClusterUsage } from '@/integrations/api/cluster/getClusterUsage';
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
				: !data?.totals
				? <Empty>No usage has been recorded for the current cycle yet.</Empty>
				: <UsageContent data={data} />}
		</ClusterContentWithSubNavMenu>
	);
}

function UsageContent({ data }: { data: ClusterUsage }) {
	const t = data.totals;
	if (!t) { return null; }
	const metered: UsageMetric[] = [
		{ label: 'Reads', used: t.reads.used, limit: t.reads.limit, format: fmtCount },
		{ label: 'Read data', used: t.readBytes.used, limit: t.readBytes.limit, format: fmtBytes },
		{ label: 'Writes', used: t.writes.used, limit: t.writes.limit, format: fmtCount },
		{ label: 'Write data', used: t.writeBytes.used, limit: t.writeBytes.limit, format: fmtBytes },
		{ label: 'Real-time messages', used: t.realTimeMessages.used, limit: t.realTimeMessages.limit, format: fmtCount },
		{ label: 'Real-time data', used: t.realTimeBytes.used, limit: t.realTimeBytes.limit, format: fmtBytes },
		{ label: 'Compute', used: t.cpuTimeHours.used, limit: t.cpuTimeHours.limit, format: fmtHours },
		{ label: 'Storage', used: t.storageBytes.used, limit: t.storageBytes.limit, format: fmtBytes },
	];

	const rl = data.regions[0]?.rateLimits;
	const rateRows = rl
		? rowsFrom([
			['Reads / minute', rl.readsPerMinute, addCommasToNumbers],
			['Writes / minute', rl.writesPerMinute, addCommasToNumbers],
			['Real-time deliveries / minute', rl.realTimeDeliveriesPerMinute, addCommasToNumbers],
			['TLS handshakes (cycle)', rl.tlsHandshakes, addCommasToNumbers],
		])
		: [];

	const rpi = data.regions[0]?.resourcesPerInstance;
	const perInstanceRows = rpi
		? rowsFrom([
			['Storage', rpi.storageGb, (n) => `${addCommasToNumbers(n)} GB`],
			['Memory', rpi.memoryMb, (n) => humanFileSize(n * 1024 * 1024)],
			['vCPU', rpi.cpuCores, (n) => `${n} ${n === 1 ? 'core' : 'cores'}`],
			['Threads', rpi.threads, (n) => String(n)],
		])
		: [];

	return (
		<>
			<p className="mt-1 text-sm text-muted-foreground">{usageSubtitle(data)}</p>

			<Section
				title="This cycle"
				subtitle="Consumption against your plan's allotment. Renews (and re-bills) when full."
			>
				<div className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
					{metered.map((m) => <UsageMeter key={m.label} {...m} />)}
				</div>
			</Section>

			{rateRows.length > 0 && (
				<Section
					title="Rate limits"
					subtitle="Throughput ceilings — not part of the cycle allotment, and not currently metered."
				>
					<InfoGrid rows={rateRows} />
				</Section>
			)}

			{perInstanceRows.length > 0 && (
				<Section title="Per-instance resources" subtitle="Provisioned capacity on each instance.">
					<InfoGrid rows={perInstanceRows} />
				</Section>
			)}
		</>
	);
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
