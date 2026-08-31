import { SchemaInvoice } from '@/integrations/api/api.gen';
import { getStripeInvoices } from '@/integrations/stripe/useGetStripeInvoices';
import { queryOptions } from '@tanstack/react-query';

export interface ClusterInvoicesResult {
	invoices: SchemaInvoice[];
	/** True when the read failed rather than came back empty — the panel says which. */
	unavailable: boolean;
}

/**
 * An organization's Stripe invoices, for matching against the invoice ids a cluster's usage rows
 * carry.
 *
 * Resolves rather than rejects on failure, deliberately: every query error routes through the shared
 * global toast with no per-query opt-out, and this is an optional enrichment on an expanded row. An
 * organization with no Stripe account answers 404 or 403, which is a normal state here — the panel
 * says so in place of the amounts, and a toast on top of that is noise the reader can't act on.
 */
export async function getClusterInvoices(organizationId: string): Promise<ClusterInvoicesResult> {
	try {
		return { invoices: await getStripeInvoices(organizationId), unavailable: false };
	} catch {
		return { invoices: [], unavailable: true };
	}
}

export function getClusterInvoicesQueryOptions(organizationId: string, enabled: boolean) {
	return queryOptions({
		queryKey: ['fabric-admin', 'cluster-invoices', organizationId],
		queryFn: () => getClusterInvoices(organizationId),
		enabled,
		retry: false,
		staleTime: 60_000,
	});
}
