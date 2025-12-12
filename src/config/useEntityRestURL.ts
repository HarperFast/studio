import { useInstanceClient } from '@/config/useInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { getRestUrlForCluster } from '@/lib/urls/getRestUrlForCluster';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';

export function useEntityRestURL(): string | null {
	const { clusterId, instanceId }: { clusterId?: string; instanceId?: string } = useParams({ strict: false });
	const instanceClient = useInstanceClient();
	const { data: cluster } = useQuery(
		getClusterInfoQueryOptions(clusterId),
	);

	const isFabricConnect = (!!clusterId && authStore.checkForFabricConnect(clusterId))
		|| !!instanceId && authStore.checkForFabricConnect(instanceId);
	if (isFabricConnect) {
		return getRestUrlForCluster(cluster);
	} else if (instanceClient.defaults.baseURL) {
		return instanceClient.defaults.baseURL.replace(/:9925\/?/, '');
	}
	return null;
}
