import { apiClient } from '@/config/apiClient';
import { SchemaStripeAccount } from '@/integrations/api/api.gen';
import { useMutation } from '@tanstack/react-query';

interface Params {
	organizationId: string;
}

export async function addStripeToOrganizationAndGetIntent(params: Params): Promise<SchemaStripeAccount> {
	const { data } = await apiClient.post(`/StripeAccount/`, params);
	return data;
}

export function useAddStripeToOrganizationAndGetIntent() {
	return useMutation<SchemaStripeAccount, Error, Params>({
		mutationFn: (params: Params) => addStripeToOrganizationAndGetIntent(params),
	});
}
