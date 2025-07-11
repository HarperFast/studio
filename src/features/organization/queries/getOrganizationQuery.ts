import { apiClient } from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';
import { Organization } from '@/lib/api.patch';

async function getOrganization(orgId: string): Promise<Organization | null> {
	const { data } = await apiClient.get(`/Organization/${orgId}` as '/Organization/{id}');
	return data;
}

function getOrganizationQueryOptions(orgId: string) {
	return queryOptions({
		queryKey: [queryKeys.organization, orgId],
		queryFn: () => getOrganization(orgId),
		retry: false,
		refetchInterval: 10000,
	});
}

export { getOrganizationQueryOptions };
