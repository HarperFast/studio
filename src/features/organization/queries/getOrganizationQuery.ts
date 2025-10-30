import { apiClient } from '@/config/apiClient';
import { Organization } from '@/lib/api.patch';
import { queryOptions } from '@tanstack/react-query';

export async function getOrganization(orgId: string): Promise<Organization> {
	const { data } = await apiClient.get(`/Organization/${orgId}` as '/Organization/{id}');
	return data;
}

export function getOrganizationQueryOptions(orgId: string) {
	return queryOptions({
		queryKey: [orgId],
		queryFn: () => getOrganization(orgId),
		retry: false,
		refetchInterval: 10000,
	});
}
