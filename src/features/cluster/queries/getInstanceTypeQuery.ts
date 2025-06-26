import { apiClient } from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';

type PlanTypes = PlanType[];

type PlanType = {
	id: string;
	selfHosted: boolean;
	useSharedProcess: boolean;
	threads?: number;
	cpu?: number;
	memory?: number;
	readIops?: number;
	writeIops?: number;
};

const getPlanTypes = async () => {
	// TODO: Work through any disagreements between the SchemaInstanceType and our local types here.
	const { data } = await apiClient.get(`/Plan`);
	return data as PlanTypes;
};

function getPlanTypesOptions() {
	return queryOptions({
		queryKey: [queryKeys.cluster, 'instancePlan'],
		queryFn: getPlanTypes,
		retry: false,
	});
}

export { getPlanTypesOptions };
