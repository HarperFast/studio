import apiClient from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';

type InstanceTypes = InstanceType[];

type InstanceType = {
	id: string;
	selfHosted: boolean;
	useSharedProcess: boolean;
	threads?: number;
	cpu?: number;
	memory?: number;
	readIops?: number;
	writeIops?: number;
};

const getInstanceTypes = async () => {
	// TODO: Work through any disagreements between the SchemaInstanceType and our local types here.
	const { data } = await apiClient.get(`/InstanceType/`);
	return data as InstanceTypes;
};

function getInstanceTypeOptions() {
	return queryOptions({
		queryKey: [queryKeys.cluster, 'instanceType'],
		queryFn: getInstanceTypes,
		retry: false,
	});
}

export { getInstanceTypeOptions };
