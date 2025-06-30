import { apiClient } from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';
import { isLocalStudio } from '@/config/constants';

type Cluster = {
	id: string;
	name: string;
	fqdn: string;
	organizationId: string;
};

type InstanceType = {
	id: string;
	selfHosted: boolean;
	useSharedProcess: boolean;
	threads: number;
	cpu: number;
	memory: number;
	readIops: number;
	writeIops: number;
};

type Instance = {
	id: string;
	status: 'PROVISIONING' | 'RUNNING' | 'STOPPED' | 'TERMINATED';
	instanceTypeId: string;
	hostId: string;
	createdByUserId: string;
	instanceFqdn: string;
	replicationHosts: string[];
	clusterId: string;
	name: string;
	version: string;
	tempPassword: string;
	cluster: Cluster;
	instanceType: InstanceType;
};

const getInstanceInfo = async (instanceId: string) => {
	// TODO: Work through any disagreements between the SchemaInstanceType and our local types here.
	if (isLocalStudio) {
		return null;
	}
	const { data } = await apiClient.get(`/HDBInstance/${instanceId}` as '/HDBInstance/{id}');
	return data as Instance;
};

function getInstanceInfoQueryOptions(instanceId: string) {
	return queryOptions({
		queryKey: [queryKeys.instance, instanceId],
		queryFn: () => getInstanceInfo(instanceId),
		retry: false,
	});
}

export type { Instance, InstanceType, Cluster };
export { getInstanceInfoQueryOptions };
