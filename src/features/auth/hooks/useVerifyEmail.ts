import { apiClient } from '@/config/apiClient';
import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { failFastOffline, OfflineSubmitError, reportAuthFailure, toastsAuthFailures } from '../failFastOffline';

type VerifyEmailToken = {
	token: string;
};

/**
 * What central-manager did with the account's password while verifying it, or `already_verified` when an
 * earlier request did the verifying. A token-only verify replaces the sign-up password with a random one,
 * then emails a set-password link (`reset_email_sent`) or, when that email can't be sent, leaves Forgot
 * Password as the way in (`password_reset_required`).
 */
type VerifyEmailOutcome = 'password_set' | 'reset_email_sent' | 'password_reset_required' | 'already_verified';

type VerifyEmailResponse = {
	userId: string;
	email: string;
	/**
	 * Absent from a central-manager that keeps the sign-up password. Open-ended because a newer one may
	 * answer with an outcome this build doesn't know.
	 */
	outcome?: VerifyEmailOutcome | (string & {});
};

const UNAVAILABLE_RETRIES = 3;
const UNAVAILABLE_RETRY_BASE_MS = 2_000;
const UNAVAILABLE_RETRY_MAX_MS = 10_000;

const onVerifyEmailTokenSubmit = async ({ token }: VerifyEmailToken): Promise<VerifyEmailResponse> => {
	// TODO: The OpenAPI types don't describe the request body, either; Record<string, never>
	const { data } = await apiClient.put<VerifyEmailToken>('/VerifyEmail/', { token });
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
	return useMutation<VerifyEmailResponse, Error, VerifyEmailToken>({
		...failFastOffline(onVerifyEmailTokenSubmit),
		...toastsAuthFailures,
		retry: (failureCount, error) => failureCount < UNAVAILABLE_RETRIES && isVerifyEmailUnavailable(error),
		retryDelay: (failureCount) => Math.min(UNAVAILABLE_RETRY_BASE_MS * 2 ** failureCount, UNAVAILABLE_RETRY_MAX_MS),
		// The page explains these itself; the toast would tell the person to check whether it took effect.
		onError: (error) => {
			if (isVerifyEmailUnconfirmed(error)) {
				reportAuthFailure(error);
				return;
			}
			toastsAuthFailures.onError(error);
		},
	});
}

export { isVerifyEmailUnavailable, isVerifyEmailUnconfirmed, useVerifyEmailMutation };
