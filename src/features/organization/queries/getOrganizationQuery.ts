import { apiClient } from '@/config/apiClient';
import { Organization } from '@/lib/api.patch';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';

export async function getOrganization(orgId: string): Promise<Organization> {
	const { data } = await apiClient.get(`/Organization/${orgId}` as '/Organization/{id}');
	return data;
}

export function getOrganizationQueryOptions(orgId: string) {
	return queryOptions({
		queryKey: [queryKeys.organization, orgId],
		queryFn: () => getOrganization(orgId),
		retry: false,
		refetchInterval: 10000,
	});
}
