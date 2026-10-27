import { getInstanceClient } from '@/config/getInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { Instance } from '@/integrations/api/api.patch';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import type { AxiosInstance } from 'axios';

export interface ClusterRestartTarget {
	instance: Instance;
	instanceClient: AxiosInstance;
}

export interface ClusterRestartTargets {
	allInstances: Instance[];
	/**
	 * A client for each RUNNING instance with an address, in the order a rolling restart visits them.
	 * One without an address is skipped: Studio treats it as not reachable yet.
	 */
	targets: ClusterRestartTarget[];
}

export async function getClusterRestartTargets(clusterId: string): Promise<ClusterRestartTargets> {
	const cluster = await getClusterInfo(clusterId);
	const allInstances = cluster?.instances ?? [];
	const clusterUsesFabricConnect = !!cluster && authStore.checkForFabricConnect(cluster.id);
	const targets = allInstances
		.filter(instance => instance.status === 'RUNNING')
		.flatMap(instance => {
			const operationsUrl = getOperationsUrlForInstance(instance);
			if (!operationsUrl) {
				return [];
			}
			return [{
				instance,
				instanceClient: getInstanceClient({
					id: instance.id,
					forceFabricConnect: clusterUsesFabricConnect,
					operationsUrl,
				}),
			}];
		})
		.reverse();
	return { allInstances, targets };
}
