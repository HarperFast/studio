import { apiClient } from '@/config/apiClient';
import { SchemaInvoice } from '@/lib/api.gen';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';

export async function getStripeInvoices(organizationId: string): Promise<SchemaInvoice[]> {
	const { data } = await apiClient.get(`/Invoice/${organizationId}` as `/Invoice/{id}`);
	// TODO: The API isn't able to describe this array result accurately yet.
	return data as unknown as SchemaInvoice[];
}

export function getStripeInvoicesQueryOptions(organizationId: string, refetch?: boolean) {
	return queryOptions({
		queryKey: [queryKeys.organization, organizationId, 'invoices'],
		queryFn: () => getStripeInvoices(organizationId!),
		retry: false,
		enabled: !!organizationId,
		refetchInterval: refetch ? 10000 : undefined,
	});
}
