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
	/** A client for each RUNNING instance, in the order a rolling restart visits them. */
	targets: ClusterRestartTarget[];
}

export async function getClusterRestartTargets(clusterId: string): Promise<ClusterRestartTargets> {
	const cluster = await getClusterInfo(clusterId);
	const allInstances = cluster?.instances ?? [];
	const clusterUsesFabricConnect = !!cluster && authStore.checkForFabricConnect(cluster.id);
	const targets = allInstances
		.filter(instance => instance.status === 'RUNNING')
		.map(instance => ({
			instance,
			instanceClient: getInstanceClient({
				id: instance.id,
				forceFabricConnect: clusterUsesFabricConnect,
				operationsUrl: getOperationsUrlForInstance(instance),
			}),
		}))
		.reverse();
	return { allInstances, targets };
}
