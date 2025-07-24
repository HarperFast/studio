import { queryOptions } from '@tanstack/react-query';
import { apiClient } from '@/config/apiClient';
import { OrganizationRole } from '@/lib/api.patch';
import { queryKeys } from '@/react-query/constants';

export function getOrganizationRoleInfoQueryOptions({
	organizationId,
	roleId,
}: {
	organizationId: string;
	roleId: string;
}) {
	return queryOptions({
		queryKey: [queryKeys.organization, queryKeys.roles, organizationId, roleId] as const,
		queryFn: () => getOrganizationRoleInfo(roleId),
		refetchInterval: 10 * 1000,
	});
}

export async function getOrganizationRoleInfo(roleId?: string): Promise<OrganizationRole> {
	const { data } = await apiClient.get(`/Role/${roleId}` as '/Role/{id}');
	return data as unknown as OrganizationRole; // Note: Not Ideal, check with Dawson on API response type
}
