import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { useQuery } from '@tanstack/react-query';

/**
 * Minimum Harper version that supports the SSE deploy/get_deployment stream and the
 * `hdb_deployment` audit table. Verified against release tags: the `SSE_PROGRESS_OPERATIONS`
 * branch ships in 5.1.0 and is absent in 5.0.x.
 */
export const MIN_DEPLOYMENT_SSE_VERSION = '5.1.0';

/**
 * True when the instance/cluster is Harper >= 5.1.0, so the deployment history/detail
 * feature (`list_deployments` / `get_deployment`) is available. This gates feature
 * visibility regardless of connection type — the list/detail work over plain polling.
 */
export function useDeploymentsAvailable(): boolean {
	const params = useInstanceClientIdParams();
	const { data } = useQuery(getRegistrationInfoQueryOptions(params));
	return !!data?.version && wasAReleasedBeforeB(MIN_DEPLOYMENT_SSE_VERSION, data.version);
}

/**
 * True when we should attempt a LIVE SSE stream (deploy progress / detail tail).
 *
 * Requires 5.1.0+ AND a direct connection: the central-manager fabric-connect proxy
 * buffers `text/event-stream` (verified — it withholds the whole response until the op
 * completes), so streaming over it yields no live progress and only wastes the idle window
 * before falling back. Proxied entities use the buffered deploy + polling detail instead.
 * If the proxy gains streaming passthrough, drop the fabric-connect check here.
 */
export function useSupportsDeploymentSSE(): boolean {
	const params = useInstanceClientIdParams();
	const available = useDeploymentsAvailable();
	return available && !authStore.checkForFabricConnect(params.entityId);
}
