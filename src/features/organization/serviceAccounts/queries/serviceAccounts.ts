import { apiClient } from '@/config/apiClient';
import { OrganizationApiToken, ServiceAccount } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

// The endpoints aren't in the generated API types yet, so the URLs and responses are cast.

export function getServiceAccountsQueryOptions(organizationId: string) {
	return queryOptions({
		queryKey: [organizationId, 'serviceAccounts'],
		queryFn: async () => {
			const { data } = await apiClient.get('/ServiceAccount/' as '/Cluster/', { params: { organizationId } });
			return data as unknown as ServiceAccount[];
		},
		retry: false,
	});
}

export function getServiceAccountTokensQueryOptions(organizationId: string, serviceAccountId: string) {
	return queryOptions({
		queryKey: [organizationId, 'apiTokens', serviceAccountId],
		queryFn: async () => {
			const { data } = await apiClient.get('/ApiToken/' as '/Cluster/', {
				params: { organizationId, serviceAccountId },
			});
			return data as unknown as OrganizationApiToken[];
		},
		retry: false,
	});
}
