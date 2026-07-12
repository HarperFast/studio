import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

export interface RegistrationInfoResponse {
	version: string;
}

export function getRegistrationInfoQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: ['registration_info', entityId] as const,
		staleTime: 60_000,
		gcTime: 5_000,
		queryFn: async () => {
			const { data } = await instanceClient.post('/', {
				operation: 'registration_info',
			});
			return data as RegistrationInfoResponse;
		},
	});
}
