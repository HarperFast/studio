import { apiClient } from '@/config/apiClient';
import { staffApiTokensQueryKey } from '@/features/admin/apiToken/queries/getStaffApiTokens';
import { MintedStaffApiToken, StaffApiTokenRole } from '@/integrations/api/api.patch';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Every field is optional to the server: the caller as owner, the owner's own role, "<role> token"
 * as the name and the role's default lifetime fill in; an empty body mints the caller a token.
 */
export interface MintStaffApiTokenPayload {
	ownerUserId?: string;
	role?: StaffApiTokenRole;
	name?: string;
	expiresInHours?: number;
}

/**
 * POST /Admin/ApiToken → a staff API token, returned with its secret this once.
 *
 * The endpoint isn't in the generated API types, so the URL and response are cast.
 */
export async function generateApiToken(payload: MintStaffApiTokenPayload = {}): Promise<MintedStaffApiToken> {
	const { data } = await apiClient.post('/Admin/ApiToken/' as '/Cluster/', payload);
	return data as unknown as MintedStaffApiToken;
}

export function useGenerateApiTokenMutation() {
	const queryClient = useQueryClient();
	return useMutation<MintedStaffApiToken, Error, MintStaffApiTokenPayload>({
		mutationFn: generateApiToken,
		// The result is a bearer credential, and the shared MutationCache is readable through
		// queryClient.getMutationCache() and the devtools. The form reset()s right after copying
		// it into local state; gcTime:0 collects whatever is left as soon as the observer unmounts.
		gcTime: 0,
		// The form toasts failures itself, so a role refusal can sit under the role field instead.
		meta: { skipGlobalErrorToast: true },
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: staffApiTokensQueryKey });
		},
	});
}
