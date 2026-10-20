import { apiClient } from '@/config/apiClient';
import { OrganizationApiToken } from '@/integrations/api/api.patch';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export async function revokeOrganizationApiToken({ tokenId }: { tokenId: string }) {
	const { data } = await apiClient.delete(`/ApiToken/${encodeURIComponent(tokenId)}` as '/Cluster/{id}');
	return data;
}

export function useRevokeOrganizationApiTokenMutation(organizationId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: revokeOrganizationApiToken,
		// Unlisted at once, so a failed refetch doesn't leave it showing as live. Refetches are not awaited, so the
		// caller's own onSuccess does not wait for them.
		onSuccess: (_, { tokenId }) => {
			queryClient.setQueriesData<OrganizationApiToken[]>(
				{ queryKey: [organizationId, 'apiTokens'] },
				(tokens) => tokens?.filter((token) => token.id !== tokenId),
			);
			void queryClient.invalidateQueries({ queryKey: [organizationId, 'apiTokens'], refetchType: 'active' });
			void queryClient.invalidateQueries({ queryKey: [organizationId, 'serviceAccounts'], refetchType: 'active' });
		},
	});
}
