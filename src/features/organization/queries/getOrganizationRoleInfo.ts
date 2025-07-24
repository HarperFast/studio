import { queryOptions } from '@tanstack/react-query';
import { apiClient } from '@/config/apiClient';
import { SchemaRole } from '@/lib/api.gen';
import { queryKeys } from '@/react-query/constants';

export interface GetOrganizationRoleInfoResponse extends SchemaRole {
	name: string;
	organizationId: string;
}

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

export async function getOrganizationRoleInfo(roleId?: string) {
	const { data } = await apiClient.get(`/Role/${roleId}` as '/Role/{id}');
	return data as GetOrganizationRoleInfoResponse;
}
