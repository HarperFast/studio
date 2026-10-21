import { apiClient } from '@/config/apiClient';
import { staffApiTokensQueryKey } from '@/features/admin/apiToken/queries/getStaffApiTokens';
import { MintedStaffApiToken, StaffApiTokenRole } from '@/integrations/api/api.patch';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/** Every field is optional to the server: an empty body mints the caller a token at their own role. */
export interface MintStaffApiTokenPayload {
	/** The staff member the token acts as; the caller when omitted. */
	ownerUserId?: string;
	/** A staff role at or below the owner's; the owner's own role when omitted. */
	role?: StaffApiTokenRole;
	/** A label of at most 100 characters; "<role> token" when omitted. */
	name?: string;
	/** Whole hours up to the role's cap (see STAFF_TOKEN_LIFETIMES); the role's default when omitted. */
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
		// The result is a bearer credential. Don't let it linger in the shared
		// MutationCache: that's readable via queryClient.getMutationCache(), shows
		// in the mutation inspector, and survives logout (logoutOnSuccess clears
		// only the QueryCache). gcTime:0 discards it the moment the observer
		// unmounts; the page also reset()s right after copying it into local state.
		gcTime: 0,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: staffApiTokensQueryKey });
		},
	});
}
