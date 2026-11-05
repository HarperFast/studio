import { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

/**
 * A release a node keeps for `deploy_component { deployment_id }` (harper
 * `v5.4.0-beta.2:components/Application.ts:1720`). `staged`: built and never live on that node. `kept`: the release an
 * activation replaced there. A release displaced before the node ran 5.4 reads `staged` too (harper#3719).
 */
interface KeptRelease {
	deployment_id: string;
	state: 'staged' | 'kept';
	/** Epoch ms it was built, or for a kept release, replaced. */
	at: number;
	/** Bytes on disk, `node_modules` included. */
	size: number;
}

export interface ComponentReleases {
	project: string;
	/** The release live on that node; absent when its tree names none, as one made live before 5.3.0 does. */
	deployment_id?: string;
	/** Newest first. The live release is not among them. */
	releases: KeptRelease[];
}

/** One node's answer: its components, or why it could not give them. */
interface NodeReleases {
	node: string;
	components?: ComponentReleases[];
	error?: string;
}

export interface ListReleasesResponse {
	nodes: NodeReleases[];
}

interface ListReleasesParams extends InstanceClientIdConfig, InstanceTypeConfig {
	project: string;
	/** What the component's records looked like when asked; a new one is a new question. */
	generation?: string;
	enabled?: boolean;
}

/**
 * What is live and kept on disk for `project` (`list_releases`, super user, 5.4.0-alpha.1+: harper
 * `v5.4.0-beta.2:components/releaseOperations.ts:36`). `list_deployments` lists what the receiving node recorded; this
 * reads each node's disk, so it is what an activation by id will find there.
 *
 * Asked of every node only on a cluster: a Harper without replication refuses `replicated: true` outright, and
 * answers for itself alone without it, which is normalized to the same list.
 */
export async function listReleases(
	{ instanceClient, entityType, project }: ListReleasesParams,
): Promise<ListReleasesResponse> {
	const replicated = entityType === 'cluster';
	const { data } = await instanceClient.post('/', { operation: 'list_releases', project, replicated });
	if (Array.isArray(data?.nodes)) {
		return data as ListReleasesResponse;
	}
	return { nodes: data && typeof data === 'object' && typeof data.node === 'string' ? [data as NodeReleases] : [] };
}

/**
 * Asked once per `generation` and never again on its own: every node walks each kept release's tree to size it. A
 * new generation is a new key, so an answer still arriving for an older one is never read as this one's. Refresh and
 * an activation invalidate it with the rest of the entity's queries.
 */
export function getReleasesQueryOptions(params: ListReleasesParams) {
	return queryOptions({
		queryKey: [params.entityId, 'list_releases', { project: params.project }, params.generation] as const,
		queryFn: () => listReleases(params),
		retry: false,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		// The last generation's answer, of the same component only, to show while this one is asked.
		placeholderData: (previous, previousQuery) =>
			(previousQuery?.queryKey[2] as { project?: string } | undefined)?.project === params.project
				? previous
				: undefined,
		enabled: params.enabled !== false,
	});
}
