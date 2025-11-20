import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

export function getOpenAPIQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [entityId, 'OpenAPI'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.get('/api/openapi/rest');
			return data;
		},
	});
}
