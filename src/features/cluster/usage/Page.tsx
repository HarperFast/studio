import { ClusterContentWithSubNavMenu } from '@/features/cluster/components/ClusterContentWithSubNavMenu';
import { METERED_ORDER, toMeter, UsageMeter } from '@/features/cluster/components/UsageMeter';
import {
	ClusterUsageRegion,
	UsageRateLimit,
	UsageRateLimits,
	UsageResourcesPerInstance,
	useClusterUsage,
} from '@/integrations/api/cluster/getClusterUsage';
import { addCommasToNumbers } from '@/lib/addCommasToNumbers';
import { humanFileSize } from '@/lib/humanFileSize';
import { useParams } from '@tanstack/react-router';
import { ChevronRight, Loader2 } from 'lucide-react';
import { ReactNode, useState } from 'react';

export function UsagePage() {
	const { clusterId } = useParams({ strict: false }) as { clusterId?: string };
	const { data, isLoading } = useClusterUsage(clusterId);

	if (isLoading) {
		return (
			<ClusterContentWithSubNavMenu className="max-w-4xl pb-20">
				<h1 className="text-2xl font-light text-foreground">Usage</h1>
				<div className="flex justify-center py-16 text-muted-foreground">
					<Loader2 className="size-6 animate-spin" />
				</div>
			</ClusterContentWithSubNavMenu>
		);
	}

	// Rate limits + per-instance resources are usually identical across a cluster's regions (same plan),
	// so when they're uniform we show them once in a shared card instead of repeating them per region.
	const shared = data && !data.selfManaged ? uniformPlanInfo(data.regions) : null;

	return (
		<ClusterContentWithSubNavMenu className="max-w-4xl pb-20">
			<h1 className="text-2xl font-light text-foreground">Usage</h1>
			{!data
				? <LoadError />
				: data.selfManaged
				? <Empty>Usage isn't tracked for self-hosted clusters — they run under their own license.</Empty>
				: data.regions.length === 0
				? <Empty>No usage has been recorded for the current cycle yet.</Empty>
				: (
					// Quota is enforced per region — each region is its own collapsible group of meters.
					<div className="mt-5 space-y-3">
						{data.regions.map((region) => (
							<RegionSection
								key={region.region ?? region.regionIds.join()}
								region={region}
								showPlanInfo={shared == null}
							/>
						))}
						{shared && (
							<CollapsibleCard
								header={<HeaderText title="Plan limits & resources" />}
								aside={shared.planId ?? undefined}
							>
								<PlanInfo rateLimits={shared.rateLimits} resourcesPerInstance={shared.resourcesPerInstance} />
							</CollapsibleCard>
						)}
					</div>
				)}
		</ClusterContentWithSubNavMenu>
	);
}

function RegionSection({ region, showPlanInfo }: { region: ClusterUsageRegion; showPlanInfo: boolean }) {
	const meters = METERED_ORDER.map((key) => toMeter(key, region.metrics[key]));
	const meta = [
		region.planName ? `${region.planName} plan` : null,
		region.status === 'exhausted'
			? 'consumed — awaiting renewal'
			: region.status === 'lapsed'
			? 'not renewed'
			: region.expiresAt
			? `renews ${fmtDate(region.expiresAt)}`
			: null,
	].filter(Boolean).join(' · ');

	return (
		// Lapsed regions have no live quota — collapse them by default so the active ones lead.
		<CollapsibleCard
			defaultOpen={region.status !== 'lapsed'}
			aside={region.regionIds.length > 0 ? region.regionIds.join(', ') : undefined}
			header={
				<HeaderText title={region.region ?? 'Region'} meta={meta}>
					{region.status === 'exhausted' && (
						<span className="rounded-full bg-yellow/10 px-2 py-0.5 text-[11px] text-yellow">Cycle exhausted</span>
					)}
					{region.status === 'lapsed' && (
						<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
							No active license
						</span>
					)}
				</HeaderText>
			}
		>
			<div className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
				{meters.map((meter) => <UsageMeter key={meter.label} {...meter} />)}
			</div>
			{showPlanInfo && <PlanInfo rateLimits={region.rateLimits} resourcesPerInstance={region.resourcesPerInstance} />}
		</CollapsibleCard>
	);
}

function CollapsibleCard(
	{ header, aside, defaultOpen = true, children }: {
		header: ReactNode;
		aside?: ReactNode;
		defaultOpen?: boolean;
		children: ReactNode;
	},
) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<section className="overflow-hidden rounded-xl border border-border">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
			>
				<ChevronRight
					className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
				/>
				<div className="min-w-0 flex-1">{header}</div>
				{aside && (
					<span className="shrink-0 self-start pt-0.5 font-mono text-[11px] text-muted-foreground/70">{aside}</span>
				)}
			</button>
			{open && <div className="border-t border-border px-4 py-4">{children}</div>}
		</section>
	);
}

function HeaderText({ title, meta, children }: { title: string; meta?: string; children?: ReactNode }) {
	return (
		<>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
				<span className="text-sm font-medium text-foreground">{title}</span>
				{children}
			</div>
			{meta && <div className="mt-0.5 text-xs text-muted-foreground">{meta}</div>}
		</>
	);
}

function PlanInfo(
	{ rateLimits, resourcesPerInstance }: {
		rateLimits: UsageRateLimits | null;
		resourcesPerInstance: UsageResourcesPerInstance | null;
	},
) {
	const rl = rateLimits;
	const rateRows = rl
		? rateRowsFrom([
			['Reads / minute', rl.readsPerMinute, addCommasToNumbers],
			['Read bandwidth / minute', rl.readsPerMinuteBytes, humanFileSize],
			['Writes / minute', rl.writesPerMinute, addCommasToNumbers],
			['Write bandwidth / minute', rl.writesPerMinuteBytes, humanFileSize],
			['Real-time deliveries / minute', rl.realTimeDeliveriesPerMinute, addCommasToNumbers],
			['Real-time bandwidth / minute', rl.realTimeDeliveryBytesPerMinute, humanFileSize],
			['TLS handshakes (cycle)', rl.tlsHandshakes, addCommasToNumbers],
		])
		: [];

	const rpi = resourcesPerInstance;
	const perInstanceRows = rpi
		? rowsFrom([
			['Storage', rpi.storageGb, (n) => `${addCommasToNumbers(n)} GB`],
			['Memory', rpi.memoryMb, (n) => humanFileSize(n * 1000 * 1000)],
			['vCPU', rpi.cpuCores, (n) => `${n} ${n === 1 ? 'core' : 'cores'}`],
			['Threads', rpi.threads, (n) => String(n)],
		])
		: [];

	return (
		<>
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
		</>
	);
}

function fmtDate(iso: string): string {
	return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(iso));
}

// True (with the shared rate/per-instance) only when every region declares the same, non-empty plan info.
function uniformPlanInfo(
	regions: ClusterUsageRegion[],
):
	| {
		rateLimits: UsageRateLimits | null;
		resourcesPerInstance: UsageResourcesPerInstance | null;
		planId: string | null;
	}
	| null
{
	if (regions.length === 0) { return null; }
	const first = regions[0];
	if (first.rateLimits == null && first.resourcesPerInstance == null) { return null; }
	const key = (r: ClusterUsageRegion) => JSON.stringify([r.rateLimits, r.resourcesPerInstance]);
	const k0 = key(first);
	// Show the shared plan id only when it's the same across every region too.
	const samePlan = regions.every((r) => r.planId === first.planId);
	return regions.every((r) => key(r) === k0)
		? {
			rateLimits: first.rateLimits,
			resourcesPerInstance: first.resourcesPerInstance,
			planId: samePlan ? first.planId : null,
		}
		: null;
}

// Build label/value rows, dropping any resource the plan didn't declare (null/undefined) or left at a
// non-positive placeholder — same as the purchase-time plan panel, so a sentinel can't render as "-1 GB".
function rowsFrom(
	entries: Array<[string, number | null | undefined, (n: number) => string]>,
): Array<[string, string]> {
	return entries
		.filter((e): e is [string, number, (n: number) => string] => typeof e[1] === 'number' && e[1] > 0)
		.map(([label, value, format]): [string, string] => [label, format(value)]);
}

// Same, for the throughput ceilings, which arrive as {value, unlimited, known}: a ceiling the plan
// doesn't declare (null) gets no row, "no ceiling" reads Unlimited, and anything we can't pin down —
// including the bare numbers a pre-normalization server sends — reads "—" rather than a hard number.
function rateRowsFrom(
	entries: Array<[string, UsageRateLimit | null, (n: number) => string]>,
): Array<[string, string]> {
	return entries
		.filter((e): e is [string, UsageRateLimit, (n: number) => string] => e[1] != null)
		.map(([label, limit, format]): [string, string] => [
			label,
			limit.unlimited ? 'Unlimited' : limit.known && limit.value != null ? format(limit.value) : '—',
		]);
}

function Empty({ children }: { children: ReactNode }) {
	return <p className="mt-3 text-sm text-muted-foreground">{children}</p>;
}

// Shown whenever loading finished and left us with no data at all. Keyed on `!data` rather than
// `isError` on purpose: a failed fetch is only one way to get here — a retry paused because the
// browser went offline leaves the query `pending`/`paused`, so `isLoading` and `isError` are BOTH
// false with no data (observed against stage). Every one of those means "we couldn't load this",
// and on a billing surface "no usage has been recorded" would instead read as a zero bill.
// Because it keys on absent data, a failed *background* refetch still renders the cached numbers.
function LoadError() {
	return (
		<div
			role="alert"
			className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
		>
			Couldn't load usage data — refresh to try again.
		</div>
	);
}

function SubSection({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
	return (
		<div className="mt-6 first:mt-0">
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
