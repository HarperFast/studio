import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import { AxiosError } from 'axios';

/**
 * How central manager answered `DELETE /UserInvite/{id}`, reduced to what the caller acts on.
 *
 * - `cancelled`: CM hard-deleted the pending user. That unlinks its roles in every organization,
 *   revokes its OAuth bindings and releases the email's account claim, so a later sign-up with
 *   that address is a fresh account (central-manager#603).
 * - `not-pending`: 404. The user exists but is no longer PENDING, which in practice means the
 *   invite was accepted after this list loaded.
 * - `forbidden`: 403. CM authorizes the caller in every organization the pending user holds a role
 *   in, and Harper 5 turns any refusal there into an opaque 403. The usual cause is a legacy invite
 *   that is also pending in an organization this admin can't manage.
 *
 * Both refusals are answers the caller handles, so they resolve instead of rejecting: a rejection
 * would also raise the shared mutation toast and its RUM report. Anything else (a 5xx, a network
 * failure, a 401) still rejects and is reported that way.
 */
type CancelUserInviteOutcome = 'cancelled' | 'not-pending' | 'forbidden';

export async function onCancelUserInvite({ userId }: { userId: string }): Promise<CancelUserInviteOutcome> {
	try {
		// No trailing slash: Harper reads `/UserInvite/<id>/` as a collection whose id is `<id>/`.
		await apiClient.delete(`/UserInvite/${encodeURIComponent(userId)}` as '/UserInvite/{id}');
		return 'cancelled';
	} catch (error) {
		const status = error instanceof AxiosError ? error.response?.status : undefined;
		if (status === 404) {
			return 'not-pending';
		}
		if (status === 403) {
			return 'forbidden';
		}
		throw error;
	}
}

/** Marks one user's cancellation in flight, so a Resend anywhere on the page waits for its verdict. */
export const cancelInviteMutationKey = (userId: string) => ['cancelInvite', userId] as const;

export function useCancelUserInvite(userId: string) {
	return useMutation<CancelUserInviteOutcome, Error, { userId: string }>({
		mutationKey: cancelInviteMutationKey(userId),
		mutationFn: onCancelUserInvite,
	});
}
