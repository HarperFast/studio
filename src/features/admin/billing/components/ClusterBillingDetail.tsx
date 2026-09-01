import { Badge } from '@/components/ui/badge';
import { getClusterInvoicesQueryOptions } from '@/features/admin/billing/queries/getClusterInvoices';
import { FleetUsageCluster } from '@/features/admin/billing/queries/getFleetUsage';
import { METERED_ORDER, toMeter, UsageMeter } from '@/features/cluster/components/UsageMeter';
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
