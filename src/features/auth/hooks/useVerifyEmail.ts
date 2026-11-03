import { apiClient } from '@/config/apiClient';
import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { failFastOffline, OfflineSubmitError, reportAuthFailure, toastsAuthFailures } from '../failFastOffline';

/**
 * A verification proves the mailbox; central-manager also wants proof that its sender chose the account's
 * password (central-manager#781): the sign-up's browser proof, or that password. `newPassword` replaces it
 * instead. Send one of the three. A central-manager without that change ignores them and verifies on the
 * token alone.
 */
type VerifyEmailRequest = {
	token: string;
	browserProof?: string;
	password?: string;
	newPassword?: string;
};

/**
 * - `verified`: proven by the browser proof or the password, which is kept.
 * - `password_set`: `newPassword` replaced it.
 * - `password_required`, `password_mismatch`: nothing changed; the proof didn't match, or the password was wrong.
 * - `reset_email_sent`, `password_reset_required`: a `newPassword` sent with a link too old to set one. The
 *   sign-up password was replaced with a random one and a set-password link emailed, or, when that email
 *   couldn't be sent, Forgot Password is the way in.
 * - `already_verified`: an earlier request did the verifying.
 */
type VerifyEmailOutcome =
	| 'verified'
	| 'password_set'
	| 'password_required'
	| 'password_mismatch'
	| 'reset_email_sent'
	| 'password_reset_required'
	| 'already_verified';

type VerifyEmailResponse = {
	userId: string;
	email: string;
	/**
	 * Absent from a central-manager without central-manager#781's change, which verified on the token alone.
	 * Open-ended because a newer one may answer with an outcome this build doesn't know.
	 */
	outcome?: VerifyEmailOutcome | (string & {});
	/** Whether central-manager opened a session, as Login does. */
	signedIn?: boolean;
};

const UNAVAILABLE_RETRIES = 3;
const UNAVAILABLE_RETRY_BASE_MS = 2_000;
const UNAVAILABLE_RETRY_MAX_MS = 10_000;

const onVerifyEmailSubmit = async (request: VerifyEmailRequest): Promise<VerifyEmailResponse> => {
	// TODO: The OpenAPI types don't describe the request body, either; Record<string, never>
	const { data } = await apiClient.put<VerifyEmailRequest>('/VerifyEmail/', request);
	return data as VerifyEmailResponse;
};

/**
 * Retried automatically: central-manager's 503 for a verification it couldn't start or finish, usually
 * because the account's record lock was unavailable, which can last minutes after a node restart. Its
 * message says to retry with the same link (`VerifyEmail.js`).
 */
function isVerifyEmailUnavailable(error: unknown): boolean {
	return isAxiosError(error) && error.response?.status === 503;
}

/**
 * A verify that didn't confirm the email: one sent while offline, or one whose outcome is unknown (that
 * 503, a gateway's 502 or 504, or no answer at all). Repeating it is safe, since one that landed answers
 * `already_verified`, so the page offers Try again with the same link instead of the new-link form.
 */
function isVerifyEmailUnconfirmed(error: unknown): boolean {
	return error instanceof OfflineSubmitError || isUnansweredWrite(error);
}

function useVerifyEmailMutation() {
	return useMutation<VerifyEmailResponse, Error, VerifyEmailRequest>({
		...failFastOffline(onVerifyEmailSubmit),
		...toastsAuthFailures,
		retry: (failureCount, error) => failureCount < UNAVAILABLE_RETRIES && isVerifyEmailUnavailable(error),
		retryDelay: (failureCount) => Math.min(UNAVAILABLE_RETRY_BASE_MS * 2 ** failureCount, UNAVAILABLE_RETRY_MAX_MS),
		// The page explains these itself and offers Try again, so a toast would say it twice.
		onError: (error) => {
			if (isVerifyEmailUnconfirmed(error)) {
				reportAuthFailure(error);
				return;
			}
			toastsAuthFailures.onError(error);
		},
	});
}

export type { VerifyEmailRequest, VerifyEmailResponse };
export { isVerifyEmailUnavailable, isVerifyEmailUnconfirmed, useVerifyEmailMutation };
