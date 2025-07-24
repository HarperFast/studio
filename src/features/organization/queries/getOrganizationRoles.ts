import { apiClient } from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';
import { OrganizationRole } from '@/lib/api.patch';

async function getOrganizationRoles(organizationId: string): Promise<OrganizationRole[]> {
	const { data } = await apiClient.get(`/OrganizationRole/${organizationId}` as '/OrganizationRole/'); // TODO: The API is not describing itself accurately.
	return data;
}

export function getOrganizationRolesQueryOptions(organizationId: string) {
	return queryOptions({
		queryKey: [queryKeys.organization, queryKeys.roles, organizationId],
		queryFn: () => getOrganizationRoles(organizationId),
		retry: false,
		refetchInterval: 10 * 1000, // 10 seconds
	});
}
