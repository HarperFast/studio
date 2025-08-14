import { apiClient } from '@/config/apiClient';
import { SchemaStripeAccount } from '@/lib/api.gen';
import { useMutation } from '@tanstack/react-query';

interface Params {
	organizationId: string;
}

export async function getNewStripeIntentForOrganization(params: Params): Promise<SchemaStripeAccount> {
	// TODO: POST /Payment/ isn't describing itself from the API.
	const { data } = await apiClient.post(`/Payment/`, { organizationId: params.organizationId });
	return data as SchemaStripeAccount;
}

export function useGetNewStripeIntentForOrganization() {
	return useMutation<SchemaStripeAccount, Error, Params>({
		mutationFn: (params: Params) => getNewStripeIntentForOrganization(params),
	});
}
