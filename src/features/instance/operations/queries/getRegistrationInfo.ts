import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

export interface RegistrationInfoResponse {
	license_expiration_date: string;
	ram_allocation: number;
	registered: boolean;
	version: string;
}

export function getRegistrationInfoQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [entityId, 'registration_info'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post('/', {
				operation: 'registration_info',
			});
			return data as RegistrationInfoResponse;
		},
	});
}
