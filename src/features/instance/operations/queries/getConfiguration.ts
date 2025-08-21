import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

interface ConfigurationInfoResponse {
	license_expiration_date: string;
	ram_allocation: number;
	registered: boolean;
	version: string;
}

export function getConfigurationQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [entityId, 'get_configuration'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post('/', {
				operation: 'get_configuration',
			});
			return data as ConfigurationInfoResponse;
		},
	});
}
