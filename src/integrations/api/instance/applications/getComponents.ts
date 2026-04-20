import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

export interface APIDirectoryEntry extends APIFileEntry {
	entries: Array<APIDirectoryEntry | APIFileEntry>;
	package?: string;
}

export interface APIFileEntry {
	name: string;
}

export async function getComponents({ instanceClient }: InstanceClientIdConfig) {
	const { data }: { data: APIDirectoryEntry } = await instanceClient.post('/', {
		operation: 'get_components',
	});
	return data;
}

export function getComponentsQueryOptions(params: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [params.entityId, 'get_components'] as const,
		queryFn: () => getComponents(params),
		retry: false,
	});
}
