import instanceClient from '@/config/instanceClient';

import { queryOptions } from '@tanstack/react-query';

type RegistrationInfoResponse = {
	license_expiration_date: string;
	ram_allocation: number;
	registered: boolean;
	version: string;
};

function getRegistrationInfoQueryOptions(instanceId: string) {
	return queryOptions({
		queryKey: [instanceId, 'registration_info'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post('/', {
				operation: 'registration_info',
			});
			return data as RegistrationInfoResponse;
		},
		enabled: Boolean(instanceId),
	});
}

export { getRegistrationInfoQueryOptions };
export type { RegistrationInfoResponse };
