import { isLocalStudio } from '@/config/constants';
import { authStore, EntityIds } from '@/features/auth/store/authStore';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { actionsAudience } from './actionsAudience';

/**
 * The cluster's own URL, also when this page is one instance of it: a trust policy belongs to the cluster. Never the
 * instance client's `baseURL`, which is the proxy's when a connection falls back to it. Only Local Studio, which Harper
 * serves from its operations port, can use the page's origin; anywhere else that is Studio's own host, and an audience
 * no token is ever requested for.
 */
export function useActionsAudience(entityId: EntityIds): { audience: string | undefined; pending: boolean } {
	const { clusterId }: { clusterId?: EntityIds } = useParams({ strict: false });
	const { data: cluster, isLoading } = useQuery(getClusterInfoQueryOptions(clusterId, false));
	const audience = actionsAudience(
		getOperationsUrlForCluster(cluster)
			?? authStore.getOperationsUrl(clusterId ?? entityId)
			?? (isLocalStudio ? window.location.origin : undefined),
	);
	// Until the cluster answers, a missing URL is unknown rather than absent.
	return { audience, pending: !audience && isLoading };
}
