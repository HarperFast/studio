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
	return useMutation<ApiTokenResult, Error, void>({ mutationFn: generateApiToken });
}
