import { apiClient } from '@/config/apiClient';
import { ApiTokenResult } from '@/integrations/api/api.patch';
import { useMutation } from '@tanstack/react-query';

/**
 * POST /Admin/ApiToken → a short-lived Bearer token for the SSO'd fabric admin.
 *
 * The endpoint isn't in the generated API types yet, so the URL and response are
 * cast (same approach as getCurrentUser / updateUserMutation).
 */
export async function generateApiToken(): Promise<ApiTokenResult> {
	const { data } = await apiClient.post('/Admin/ApiToken' as '/Cluster/', {});
	return data as unknown as ApiTokenResult;
}

export function useGenerateApiTokenMutation() {
	return useMutation<ApiTokenResult, Error, void>({
		mutationFn: generateApiToken,
		// The result is a bearer credential. Don't let it linger in the shared
		// MutationCache: that's readable via queryClient.getMutationCache(), shows
		// in the mutation inspector, and survives logout (logoutOnSuccess clears
		// only the QueryCache). gcTime:0 discards it the moment the observer
		// unmounts; the page also reset()s right after copying it into local state.
		gcTime: 0,
	});
}
