import { apiClient } from '@/config/apiClient';
import { staffApiTokensQueryKey } from '@/features/admin/apiToken/queries/getStaffApiTokens';
import { StaffApiToken } from '@/integrations/api/api.patch';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export interface RevokedStaffApiToken {
	id: string;
	revoked: boolean;
}

/**
 * DELETE /Admin/ApiToken/:id → revoke a token. The server answers the same for a token already
 * revoked, so a repeat is harmless.
 */
export async function revokeApiToken(id: string): Promise<RevokedStaffApiToken> {
	const { data } = await apiClient.delete(`/Admin/ApiToken/${encodeURIComponent(id)}` as '/Cluster/{id}');
	return data as unknown as RevokedStaffApiToken;
}

export function useRevokeApiTokenMutation() {
	const queryClient = useQueryClient();
	return useMutation<RevokedStaffApiToken, Error, string>({
		mutationFn: revokeApiToken,
		// Shown as revoked at once, so a failed refetch can't leave it looking live; a revoked token
		// stays listed, so it is marked rather than dropped.
		onSuccess: (_, id) => {
			const revokedAt = new Date().toISOString();
			queryClient.setQueriesData<StaffApiToken[]>(
				{ queryKey: staffApiTokensQueryKey },
				(tokens) => tokens?.map((token) => (token.id === id ? { ...token, status: 'revoked', revokedAt } : token)),
			);
			void queryClient.invalidateQueries({ queryKey: staffApiTokensQueryKey });
		},
	});
}
