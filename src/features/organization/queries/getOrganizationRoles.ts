import { apiClient } from '@/config/apiClient';
import { SchemaOrganizationRole } from '@/integrations/api/api.gen';
import { pollUnlessForbidden } from '@/react-query/pollUnlessForbidden';
import { queryOptions } from '@tanstack/react-query';

async function getOrganizationRoles(organizationId: string): Promise<SchemaOrganizationRole[]> {
	const { data } = await apiClient.get(`/OrganizationRole/${organizationId}` as '/OrganizationRole/'); // TODO: The API is not describing itself accurately.
	return data;
}

export function getOrganizationRolesQueryOptions(organizationId: string) {
	return queryOptions({
		queryKey: [organizationId, 'roles'],
		queryFn: () => getOrganizationRoles(organizationId),
		// `retry: false` surfaces the error immediately, so the wrapper sees a 403 on
		// the first failure without a `retryUnlessForbidden` predicate.
		retry: false,
		refetchInterval: pollUnlessForbidden(10 * 1000), // 10 seconds, until a 403
	});
}
