import { instanceClient } from '@/config/instanceClient';

import { queryOptions } from '@tanstack/react-query';

type ConfigurationInfoResponse = {
	license_expiration_date: string;
	ram_allocation: number;
	registered: boolean;
	version: string;
};

function getConfigurationQueryOptions(instanceId: string) {
	return queryOptions({
		queryKey: [instanceId, 'get_configuration'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post('/', {
				operation: 'get_configuration',
			});
			return data as ConfigurationInfoResponse;
		},
		enabled: Boolean(instanceId),
	});
}

export { getConfigurationQueryOptions };
export type { ConfigurationInfoResponse };
