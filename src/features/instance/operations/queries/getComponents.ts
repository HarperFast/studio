import instanceClient from '@/config/instanceClient';

import { queryOptions } from '@tanstack/react-query';

type GetComponentsResponse = {
	entries: object[];
	name: string;
};
function getComponentsQueryOptions(instanceId: string) {
	return queryOptions({
		queryKey: [instanceId, 'get_components'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post('/', {
				operation: 'get_components',
			});
			return data as GetComponentsResponse;
		},
		retry: false,
	});
}

export { getComponentsQueryOptions };
export type { GetComponentsResponse };
