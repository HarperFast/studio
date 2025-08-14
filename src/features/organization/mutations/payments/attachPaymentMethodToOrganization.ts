import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

interface Params {
	organizationId: string;
	paymentMethodId: string;
}

export async function onAttachPaymentMethodToOrganization(params: Params): Promise<void> {
	// TODO: PUT /Payment/ isn't describing itself from the API.
	await apiClient.put(`/Payment/`, params);
}

export function useAttachPaymentMethodToOrganization() {
	return useMutation<void, Error, Params>({
		mutationFn: (params: Params) => onAttachPaymentMethodToOrganization(params),
	});
}
