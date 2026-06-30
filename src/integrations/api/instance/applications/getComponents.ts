import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

/** Harper component status levels (Harper >= 5.1.0). */
export type ComponentStatusLevel = 'healthy' | 'warning' | 'error' | 'unknown' | 'loading';

export interface ComponentStatus {
	status: ComponentStatusLevel;
	message?: string;
	/** Per-worker check timestamps; shape varies, kept loose. */
	lastChecked?: unknown;
}

export interface APIDirectoryEntry extends APIFileEntry {
	entries: Array<APIDirectoryEntry | APIFileEntry>;
	package?: string;
	/** Present on Harper >= 5.1.0 for top-level component entries. */
	status?: ComponentStatus;
}

export interface APIFileEntry {
	name: string;
	mtime?: number;
}

export async function getComponents({ instanceClient }: InstanceClientIdConfig) {
	const { data }: { data: APIDirectoryEntry } = await instanceClient.post('/', {
		operation: 'get_components',
	});
	return data;
}

export function getComponentsQueryOptions(params: InstanceClientIdConfig & { enabled?: boolean }) {
	return queryOptions({
		queryKey: [params.entityId, 'get_components'] as const,
		queryFn: () => getComponents(params),
		retry: false,
		enabled: params.enabled !== false,
	});
}
