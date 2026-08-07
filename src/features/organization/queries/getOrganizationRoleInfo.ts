import { apiClient } from '@/config/apiClient';
import { SchemaRole } from '@/integrations/api/api.gen';
import { pollUnlessForbidden, retryUnlessRejected } from '@/react-query/pollUnlessForbidden';
import { queryOptions } from '@tanstack/react-query';

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
		queryKey: [organizationId, 'roles', roleId] as const,
		queryFn: () => getOrganizationRoleInfo(roleId),
		refetchInterval: pollUnlessForbidden(10 * 1000),
		retry: retryUnlessRejected(),
	});
}

export async function getOrganizationRoleInfo(roleId?: string) {
	const { data } = await apiClient.get(`/Role/${roleId}` as '/Role/{id}');
	return data as GetOrganizationRoleInfoResponse;
}
