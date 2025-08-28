import { apiClient } from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';

async function getPlanTypes(organizationId: string) {
	const { data } = await apiClient.get(`/Plan/`, {
		params: {
			organizationId,
		},
	});
	return data;
}

export function getPlanTypesOptions(organizationId: string) {
	return queryOptions({
		queryKey: [queryKeys.organization, organizationId, 'instancePlan'],
		queryFn: () => getPlanTypes(organizationId),
		retry: false,
	});
}
