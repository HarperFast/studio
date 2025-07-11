import { apiClient } from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';

const getPlanTypes = async () => {
	const { data } = await apiClient.get(`/Plan/`);
	return data;
};

function getPlanTypesOptions() {
	return queryOptions({
		queryKey: [queryKeys.cluster, 'instancePlan'],
		queryFn: getPlanTypes,
		retry: false,
	});
}

export { getPlanTypesOptions };
