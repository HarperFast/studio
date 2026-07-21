import { errorText } from '@/lib/errorText';
import { isAxiosError } from 'axios';

/**
 * Detects the cloud-login rejection that means "this account exists and the password was
 * correct, but the email address hasn't been verified yet".
 *
 * central-manager's `Login` resource checks verification *after* validating the password
 * (so an attacker with a wrong password can't distinguish an unverified account from a bad
 * one) and throws HTTP 403 with the message "User has not verified email address". A
 * *deactivated* account also comes back as 403, so we additionally match the message — a
 * bare status check would wrongly funnel deactivated users into the email-verification flow.
 *
 * Because this state is only reachable once the password has been accepted, callers can treat
 * it as proof of valid credentials (e.g. safe to auto-resend a verification link).
 */
export function isEmailNotVerifiedError(error: unknown): boolean {
	if (!isAxiosError(error) || error.response?.status !== 403) {
		return false;
	}
	const data = error.response.data as string | { error?: unknown; message?: unknown } | undefined;
	const message = typeof data === 'string'
		? data
		: errorText(data?.error) ?? errorText(data?.message) ?? '';
	return /verif/i.test(message);
}
