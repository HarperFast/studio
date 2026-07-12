import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

export function getInstanceHealthQueryOptions({
	entityId,
	instanceClient,
}: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: ['health', entityId] as const,
		queryFn: async () => {
			try {
				await instanceClient.get('/health');
				return true;
			} catch {
				return false;
			}
		},
		retry: 2,
		refetchInterval: 5000,
	});
}
