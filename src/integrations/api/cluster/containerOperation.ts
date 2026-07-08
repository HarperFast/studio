import { apiClient } from '@/config/apiClient';
import { ContainerAction } from '@/integrations/api/instance/containerOperation';
import { useMutation } from '@tanstack/react-query';

export type ContainerStrategy = 'parallel' | 'rolling';

export interface ClusterContainerOperationParams {
	clusterId: string;
	action: ContainerAction;
	/** start/restart only. Explicit false exits safe mode. Backend rejects safeMode + rolling. */
	safeMode?: boolean;
	/** parallel (all at once) or rolling (one at a time, waiting for each to rejoin). */
	strategy?: ContainerStrategy;
}

export interface ClusterContainerOperationResponse {
	clusterId: string;
	action: ContainerAction;
	strategy: ContainerStrategy;
	/** Transitional cluster status returned immediately (STOPPING / STARTING / RESTARTING). */
	status: string;
	instanceIds: string[];
	message: string;
}

/**
 * Dispatch a cluster-wide container lifecycle op via the central manager:
 * POST /Cluster/{id}/container/{action}. Fans the action out to every instance.
 *
 * Async: the endpoint returns a transitional status immediately; the resting status lands as the
 * fan-out completes (the clusters list / overview poll reflect it).
 *
 * NOTE: hand-typed past the generated SDK (the /container/{action} path + safeMode/strategy body
 * aren't in the CM OpenAPI yet) — same pattern as terminateCluster / the instance op.
 */
export async function clusterContainerOperation(
	{ clusterId, action, safeMode, strategy }: ClusterContainerOperationParams,
): Promise<ClusterContainerOperationResponse> {
	const body: { safeMode?: boolean; strategy?: ContainerStrategy } = {};
	if (safeMode !== undefined) { body.safeMode = safeMode; }
	if (strategy !== undefined) { body.strategy = strategy; }
	const { data } = await apiClient.post(`/Cluster/${clusterId}/container/${action}` as '/Cluster/{id}', body);
	return data as ClusterContainerOperationResponse;
}

export function useClusterContainerOperation() {
	return useMutation({ mutationFn: clusterContainerOperation });
}
