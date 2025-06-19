import { BadgeStatus } from '@/components/ui/utils/badgeStatus';
import apiClient from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';
import { SchemaCluster, SchemaHdbInstance } from '@/lib/api.gen';

// TODO: The OpenAPI types aren't very comprehensive for these two types.
interface Instance extends SchemaHdbInstance {
	id: string;
	status: BadgeStatus;
	instanceTypeId: string;
	hostId: string;
	createdByUserId: string;
	instanceFqdn: string;
	replicationHosts: string[];
	clusterId: string;
	name: string;
	version: string;
	tempPassword: string;
}

interface Cluster extends SchemaCluster {
	id: string;
	organizationId: string;
	name: string;
	instances: Instance[];
}

const getClusterInfo = async (clusterId: string) => {
	const { data } = await apiClient.get(`/Cluster/${clusterId}` as '/Cluster/{id}');
	return data as Cluster;
};

function getClusterInfoQueryOptions(clusterId: string, enabled = true) {
	return queryOptions({
		queryKey: [queryKeys.cluster, clusterId],
		queryFn: () => getClusterInfo(clusterId),
		retry: false,
		enabled,
	});
}

export type { Cluster, Instance };
export { getClusterInfoQueryOptions };
