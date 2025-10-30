import { apiClient } from '@/config/apiClient';
import { SchemaInvoice } from '@/lib/api.gen';
import { queryOptions } from '@tanstack/react-query';

export async function getStripeInvoices(organizationId: string): Promise<SchemaInvoice[]> {
	const { data } = await apiClient.get(`/Invoice/${organizationId}` as `/Invoice/{id}`);
	// TODO: The API isn't able to describe this array result accurately yet.
	return data as unknown as SchemaInvoice[];
}

export function getStripeInvoicesQueryOptions(organizationId: string | undefined | false, refetch?: boolean) {
	return queryOptions({
		queryKey: [organizationId, 'invoices'],
		queryFn: () => getStripeInvoices(organizationId as string),
		retry: false,
		enabled: !!organizationId,
		refetchInterval: refetch ? 10000 : undefined,
	});
}
