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

/** What a PR preview was deployed from (harper `components/deploymentProvenance.ts`), on Harper 5.4+. */
export interface PreviewMetadata {
	app: string;
	pr: number;
	repository?: string;
	branch?: string;
	sha?: string;
	/** ISO 8601, or epoch milliseconds. */
	expiresAt?: string | number;
}

export interface APIDirectoryEntry extends APIFileEntry {
	entries: Array<APIDirectoryEntry | APIFileEntry>;
	package?: string;
	/** Present on Harper >= 5.1.0 for top-level component entries. */
	status?: ComponentStatus;
	/** The host an isolated application serves on. */
	host?: string;
	/** Present on a top-level entry whose live release was deployed as a preview. */
	preview?: PreviewMetadata;
}

export interface APIFileEntry {
	name: string;
	mtime?: number;
	/**
	 * Uncompressed bytes, sent by Harper on every file entry. Note the tree omits `node_modules`
	 * entirely, so summing it yields the `skip_node_modules: true` package size — see
	 * `measureProjectPackage`.
	 */
	size?: number;
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
