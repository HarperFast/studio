import { apiClient } from '@/config/apiClient';
import { StaffApiToken } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

/**
 * GET /Admin/ApiToken/ → staff API tokens, newest first, never their secrets. The server scopes the
 * list: an `apiToken:create` holder sees every owner's, anyone else only their own. Ended tokens
 * stay listed for 30 days with their status.
 *
 * The endpoint isn't in the generated API types, so the URL and response are cast.
 */
export async function getStaffApiTokens(): Promise<StaffApiToken[]> {
	// Trailing slash required: without it Harper returns the collection descriptor, not the rows.
	const { data } = await apiClient.get('/Admin/ApiToken/' as '/Cluster/');
	return data as unknown as StaffApiToken[];
}

export const staffApiTokensQueryKey = ['fabric-admin', 'apiTokens'];

export function getStaffApiTokensQueryOptions() {
	return queryOptions({
		queryKey: staffApiTokensQueryKey,
		queryFn: getStaffApiTokens,
		retry: false,
	});
}
