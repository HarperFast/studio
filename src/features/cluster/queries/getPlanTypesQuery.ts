import { apiClient } from '@/config/apiClient';
import { Plan } from '@/lib/api.patch';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';

const getPlanTypes = async () => {
	const { data } = await apiClient.get(`/Plan/`);
	return data as Plan[];
};

function getPlanTypesOptions() {
	return queryOptions({
		queryKey: [queryKeys.cluster, 'instancePlan'],
		queryFn: getPlanTypes,
		retry: false,
	});
}

export { getPlanTypesOptions };
