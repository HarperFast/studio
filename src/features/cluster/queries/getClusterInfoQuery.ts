import { BadgeStatus } from '@/components/ui/utils/badgeStatus';
import apiClient from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';

type Instance = {
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
};

type Cluster = {
	id: string;
	organizationId: string;
	name: string;
	instances: Instance[];
};

const getClusterInfo = async (clusterId: string) => {
	const { data } = await apiClient.get(`/Cluster/${clusterId}`);
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
