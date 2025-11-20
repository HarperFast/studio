import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

export interface APIDirectoryEntry extends APIFileEntry {
	entries: Array<APIDirectoryEntry | APIFileEntry>;
	package?: string;
}

export interface APIFileEntry {
	name: string;
}

export function getComponentsQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [entityId, 'get_components'] as const,
		queryFn: async () => {
			const { data }: { data: APIDirectoryEntry } = await instanceClient.post('/', {
				operation: 'get_components',
			});
			return data;
		},
		retry: false,
	});
}
