import { apiClient } from '@/config/apiClient';
import { SchemaOrganizationDomain } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

async function getOrganizationDomains(organizationId: string): Promise<SchemaOrganizationDomain[]> {
	const { data } = await apiClient.get(`/Domain/?organizationId=${organizationId}` as any);
	// TODO: The API is not describing itself accurately.
	return data;
}

export function getOrganizationDomainsQueryOptions(organizationId: string) {
	return queryOptions({
		queryKey: [organizationId, 'domains'],
		queryFn: () => getOrganizationDomains(organizationId),
	});
}
