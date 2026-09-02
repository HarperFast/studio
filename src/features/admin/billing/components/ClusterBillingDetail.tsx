import { Badge } from '@/components/ui/badge';
import { getClusterInvoicesQueryOptions } from '@/features/admin/billing/queries/getClusterInvoices';
import { FleetUsageCluster } from '@/features/admin/billing/queries/getFleetUsage';
import { METERED_ORDER, toMeter, UsageMeter } from '@/features/cluster/components/UsageMeter';
import { ClusterUsageRegion } from '@/integrations/api/cluster/getClusterUsage';
import { useQuery } from '@tanstack/react-query';

const money = (amount: number, currency: string) =>
	new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100);

const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
/** Stripe timestamps are seconds, not milliseconds. */
const fmtEpoch = (seconds: number) => dateFmt.format(new Date(seconds * 1000));
const fmtIso = (iso: string | null) => {
	if (!iso) { return '—'; }
	const at = new Date(iso);
	return Number.isNaN(at.getTime()) ? '—' : dateFmt.format(at);
};

const STATUS_VARIANT = { active: 'success', exhausted: 'destructive', lapsed: 'secondary' } as const;

const blocks = (n: number) => `${n} ${n === 1 ? 'block' : 'blocks'}`;

/**
 * Why this region's invoice list looks the way it does, from the per-block record rather than the
 * cluster's current grant. A cluster's grant source says what covers it NOW; a block's stamp says
 * what covered it THEN, and only the latter can tell "never billable" from "not yet billed". A
 * cluster that converted mid-history legitimately has both, so both are shown rather than one picked.
 */
function InvoiceState({ region }: { region: ClusterUsageRegion }) {
	const invoiced = region.stripeInvoiceIds?.length ?? 0;
	const nonBillable = region.nonBillableBlockCount ?? 0;
	const pending = region.uninvoicedBlockCount ?? 0;
	// Invoiced blocks are listed below by id; nothing to say here unless something is NOT invoiced.
	if (nonBillable === 0 && pending === 0) { return null; }
	return (
		<ul className="mt-3 flex flex-col gap-0.5 text-xs">
			{nonBillable > 0 && (
				<li className="text-muted-foreground">
					{blocks(nonBillable)}{' '}
					billed offline or complimentary — covered by a non-Stripe grant at the time, never invoiced.
				</li>
			)}
			{pending > 0 && (
				<li className="text-amber-600 dark:text-amber-400">
					{blocks(pending)} awaiting invoice — billable, and invoicing has not run for {pending === 1 ? 'it' : 'them'}
					{' '}
					yet.
				</li>
			)}
			{invoiced === 0 && nonBillable > 0 && pending > 0 && (
				<li className="text-muted-foreground">Mixed history: this cluster converted to paid part-way through.</li>
			)}
		</ul>
	);
}

/**
 * What one cluster consumed and what it was charged.
 *
 * Quota is enforced per region, so the meters are per region rather than rolled into one — a
 * cluster-wide number would have no denominator. Invoices are fetched per organization, only when a
 * row is opened, and matched to the block ids the usage rollup carries for each region.
 */
export function ClusterBillingDetail({ usage, organizationId }: { usage: FleetUsageCluster; organizationId: string }) {
	const invoiceIds = usage.regions.flatMap((region) => region.stripeInvoiceIds ?? []);
	// Only asked for when there is something to match it against — one Stripe round-trip per org.
	const invoicesQuery = useQuery(getClusterInvoicesQueryOptions(organizationId, invoiceIds.length > 0));
	const invoiceById = new Map((invoicesQuery.data?.invoices ?? []).map((invoice) => [invoice.id, invoice]));

	if (usage.selfManaged) {
		return (
			<p className="p-4 text-sm text-muted-foreground">
				Self-hosted — this cluster runs under its own license, so Fabric meters nothing for it.
			</p>
		);
	}

	if (usage.regions.length === 0) {
		return <p className="p-4 text-sm text-muted-foreground">No usage has been recorded for the current cycle yet.</p>;
	}

	return (
		<div className="flex max-w-4xl flex-col gap-5 border-l-2 border-border py-3 pr-4 pl-6">
			{usage.regions.map((region) => (
				<div key={region.region ?? region.regionIds.join()}>
					<div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
						<span className="text-sm font-medium">{region.region ?? region.regionIds.join(', ')}</span>
						<Badge variant={STATUS_VARIANT[region.status]} className="text-[10px]">{region.status}</Badge>
						<span className="font-mono text-xs text-muted-foreground">{region.planId ?? '—'}</span>
						<span className="text-xs text-muted-foreground">renews {fmtIso(region.expiresAt)}</span>
					</div>

					<div className="grid gap-x-10 gap-y-2.5 md:grid-cols-2">
						{METERED_ORDER.map((key) => <UsageMeter key={key} {...toMeter(key, region.metrics[key])} />)}
					</div>

					<InvoiceState region={region} />

					{(region.stripeInvoiceIds?.length ?? 0) > 0 && (
						<div className="mt-3 border-t pt-2">
							<p className="mb-1 text-xs font-medium text-muted-foreground">Invoices</p>
							{invoicesQuery.isLoading
								? <p className="text-xs text-muted-foreground">Loading invoices…</p>
								: (
									<ul className="flex flex-col gap-1">
										{region.stripeInvoiceIds?.map((id) => {
											const invoice = invoiceById.get(id);
											return (
												<li key={id} className="flex flex-wrap items-baseline gap-x-3 text-xs">
													<span className="font-mono">{invoice?.number ?? id}</span>
													{invoice
														? (
															<>
																<span className="tabular-nums">
																	{money(invoice.amountPaid, invoice.currency)} paid
																</span>
																{invoice.amountDue > invoice.amountPaid && (
																	<span className="tabular-nums text-amber-600 dark:text-amber-400">
																		{money(invoice.amountDue - invoice.amountPaid, invoice.currency)} due
																	</span>
																)}
																<span className="text-muted-foreground">
																	{fmtEpoch(invoice.periodStart)} – {fmtEpoch(invoice.periodEnd)}
																</span>
															</>
														)
														: (
															// Said out loud rather than rendered as a blank amount: the block records an
															// invoice that this organization's Stripe account does not return.
															<span className="text-muted-foreground">
																{invoicesQuery.data?.unavailable
																	? 'no billing account for this organization'
																	: 'not found in Stripe'}
															</span>
														)}
												</li>
											);
										})}
									</ul>
								)}
						</div>
					)}
				</div>
			))}
		</div>
	);
}
