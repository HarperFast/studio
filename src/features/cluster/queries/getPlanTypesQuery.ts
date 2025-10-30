import { apiClient } from '@/config/apiClient';
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
		queryKey: [organizationId, 'instancePlan'],
		queryFn: () => getPlanTypes(organizationId),
		retry: false,
	});
}
