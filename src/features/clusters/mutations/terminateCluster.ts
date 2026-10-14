import { apiClient } from '@/config/apiClient';
import { authStore } from '@/features/auth/store/authStore';
import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { clusterSignInIds } from '@/features/cluster/terminatedClusterSignIns';
import { Cluster } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { useMutation } from '@tanstack/react-query';

export async function terminateCluster(clusterId: string) {
	const before = readCluster(clusterId);
	const { data } = await apiClient.delete(`/Cluster/${clusterId}` as '/Cluster/{id}', { timeout: 0 });
	void forgetSignIns(clusterId, before);
	return data;
}

/**
 * The organization's cluster list carries no instances, so they come from the cluster record: read alongside the DELETE,
 * or read back after it, since central manager keeps a terminated cluster's record and its instances. Without either
 * read nothing is forgotten, since the cluster might be self-hosted: a Fabric cluster's go on its next visit
 * (`ClusterLayout`), a self-hosted one's at the next app sign-out. A removed self-hosted cluster's servers may still run,
 * so they are sent a logout too.
 */
async function forgetSignIns(clusterId: string, before: Promise<Cluster | undefined>): Promise<void> {
	const cluster = await before ?? await readCluster(clusterId);
	if (!cluster) {
		return;
	}
	if (clusterIsSelfManaged(cluster)) {
		await authStore.signOutEntities(clusterSignInIds(cluster));
	} else {
		authStore.signOutEntitiesLocally(clusterSignInIds(cluster));
	}
}

function readCluster(clusterId: string): Promise<Cluster | undefined> {
	return getClusterInfo(clusterId).catch((error: unknown) => {
		console.debug(
			`Could not read cluster ${clusterId} to forget its sign-ins`,
			error instanceof Error ? error.message : error,
		);
		return undefined;
	});
}

export function useTerminateClusterMutation() {
	return useMutation({
		mutationFn: (clusterId: string) => terminateCluster(clusterId),
	});
}
