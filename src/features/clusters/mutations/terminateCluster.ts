import { apiClient } from '@/config/apiClient';
import { authStore } from '@/features/auth/store/authStore';
import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { useMutation } from '@tanstack/react-query';

export async function terminateCluster(clusterId: string) {
	const { data } = await apiClient.delete(`/Cluster/${clusterId}` as '/Cluster/{id}', { timeout: 0 });
	authStore.signOutEntitiesLocally([clusterId]);
	void forgetInstanceSignIns(clusterId);
	return data;
}

/**
 * The organization's cluster list carries no instances, but central manager keeps a terminated cluster's record with
 * every instance it had, so they are read back after the DELETE. A failed read leaves them to `ClusterTerminated`.
 */
async function forgetInstanceSignIns(clusterId: string): Promise<void> {
	try {
		const { instances } = await getClusterInfo(clusterId);
		authStore.signOutEntitiesLocally((instances ?? []).map((instance) => instance.id));
	} catch (error) {
		console.debug(
			`Could not list terminated cluster ${clusterId}'s instances to forget their sign-ins`,
			error instanceof Error ? error.message : error,
		);
	}
}

export function useTerminateClusterMutation() {
	return useMutation({
		mutationFn: (clusterId: string) => terminateCluster(clusterId),
	});
}
