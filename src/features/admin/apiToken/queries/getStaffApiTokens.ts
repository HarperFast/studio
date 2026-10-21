import { apiClient } from '@/config/apiClient';
import { StaffApiToken } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

/**
 * GET /Admin/ApiToken/ → staff API tokens, newest first, never their secrets. The server scopes the
 * list: an `apiToken:create` holder sees every owner's, anyone else only their own, whatever
 * `ownerUserId` asks for. Ended tokens stay listed for 30 days with their status.
 *
 * The endpoint isn't in the generated API types, so the URL and response are cast.
 */
export async function getStaffApiTokens(ownerUserId?: string): Promise<StaffApiToken[]> {
	// Trailing slash required: without it Harper returns the collection descriptor, not the rows.
	const url = ownerUserId ? `/Admin/ApiToken/?ownerUserId=${encodeURIComponent(ownerUserId)}` : '/Admin/ApiToken/';
	const { data } = await apiClient.get(url as '/Cluster/');
	return data as unknown as StaffApiToken[];
}

/** Prefix of every token list query, whatever owner it was scoped to. */
export const staffApiTokensQueryKey = ['fabric-admin', 'apiTokens'];

export function getStaffApiTokensQueryOptions(ownerUserId?: string) {
	return queryOptions({
		queryKey: [...staffApiTokensQueryKey, ownerUserId ?? 'all'],
		queryFn: () => getStaffApiTokens(ownerUserId),
		retry: false,
	});
}
