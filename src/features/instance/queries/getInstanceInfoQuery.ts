import { apiClient } from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';
import { isLocalStudio } from '@/config/constants';
import { instanceClient } from '@/config/instanceClient';

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
	if (isLocalStudio) {
		return null;
	}
	// TODO: Work through any disagreements between the SchemaInstanceType and our local types here.
	const { data } = await apiClient.get(`/HDBInstance/${instanceId}` as '/HDBInstance/{id}');
	if (data) {
		// Set the base URL for the instance client to the first FQDN of the instance
		// This allows all subsequent API calls to use the correct base URL for the instance
		instanceClient.defaults.baseURL = data.instanceFqdn;
	}
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
