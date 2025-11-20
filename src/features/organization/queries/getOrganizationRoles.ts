import { apiClient } from '@/config/apiClient';
import { SchemaOrganizationRole } from '@/integrations/api/api.gen';
import { queryOptions } from '@tanstack/react-query';

async function getOrganizationRoles(organizationId: string): Promise<SchemaOrganizationRole[]> {
	const { data } = await apiClient.get(`/OrganizationRole/${organizationId}` as '/OrganizationRole/'); // TODO: The API is not describing itself accurately.
	return data;
}

export function getOrganizationRolesQueryOptions(organizationId: string) {
	return queryOptions({
		queryKey: [organizationId, 'roles'],
		queryFn: () => getOrganizationRoles(organizationId),
		retry: false,
		refetchInterval: 10 * 1000, // 10 seconds
	});
}
