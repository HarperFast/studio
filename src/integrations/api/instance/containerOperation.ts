import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

export type ContainerAction = 'stop' | 'start' | 'restart';

export interface InstanceContainerOperationParams {
	instanceId: string;
	action: ContainerAction;
	/** Only meaningful for start/restart; omit for stop. Explicit `false` exits safe mode. */
	safeMode?: boolean;
}

export interface InstanceContainerOperationResponse {
	instanceId: string;
	action: ContainerAction;
	/** Transitional status returned immediately (STOPPING / STARTING / RESTARTING). */
	status: string;
	message: string;
}

/**
 * Dispatch a container lifecycle op (stop/start/restart) to an instance via the central manager:
 * POST /HDBInstance/{id}/container/{action}.
 *
 * This is a DIFFERENT class from the proxied Harper `restart` operation (which goes through the
 * instance ops API and needs Harper to be up). Container ops are handled host-side and support
 * `safeMode` (boot without loading user apps/components). The op is async: the endpoint returns a
 * transitional status immediately and the resting status lands later — the instances-page poll
 * reflects it.
 *
 * NOTE: these endpoints aren't in the generated OpenAPI/SDK yet, so the URL is cast past the
 * typed-path check (same pattern as terminateCluster). Replace the cast with the generated path
 * once the CM OpenAPI exposes /HDBInstance/{id}/container/{action}.
 */
export async function instanceContainerOperation(
	{ instanceId, action, safeMode }: InstanceContainerOperationParams,
): Promise<InstanceContainerOperationResponse> {
	const body = safeMode === undefined ? {} : { safeMode };
	const { data } = await apiClient.post(
		`/HDBInstance/${instanceId}/container/${action}` as '/HDBInstance/{id}',
		body,
	);
	return data as InstanceContainerOperationResponse;
}

export function useInstanceContainerOperation() {
	return useMutation({ mutationFn: instanceContainerOperation });
}
