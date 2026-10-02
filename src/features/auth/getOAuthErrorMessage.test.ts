import { describe, expect, it } from 'vitest';
import { getOAuthErrorMessage, OAUTH_GENERIC_ERROR_MESSAGE } from './getOAuthErrorMessage';

describe('getOAuthErrorMessage', () => {
	it('returns undefined when there is no error param', () => {
		expect(getOAuthErrorMessage(null, null)).toBeUndefined();
		expect(getOAuthErrorMessage(null, 'csrf')).toBeUndefined();
	});

	it.each([
		['state_storage', 'temporarily unavailable'],
		['account_lookup_failed', 'temporarily unavailable'],
		['identity_resolution', 'temporarily unavailable'],
		['token_exchange', 'temporarily unavailable'],
		['user_mapping', 'temporarily unavailable'],
		['user_info', 'temporarily unavailable'],
		['login_hook', 'temporarily unavailable'],
		['internal_error', 'temporarily unavailable'],
		['unknown', 'temporarily unavailable'],
	])('maps reason=%s to a transient, retry-later message', (reason, expectedSubstring) => {
		expect(getOAuthErrorMessage('auth_failed', reason)).toContain(expectedSubstring);
	});

	it('names the actual problem for an expired/mismatched CSRF state', () => {
		expect(getOAuthErrorMessage('auth_failed', 'csrf')).toBe(
			'Your sign-in session expired. Please try signing in again.',
		);
	});

	it('tells the user to verify their email, not to retry', () => {
		expect(getOAuthErrorMessage('access_denied', 'email_not_verified')).toBe(
			'Verify your email address before signing in with this provider.',
		);
	});

	it.each(['provider_not_authorized', 'login_not_allowed', 'denied', 'login_denied'])(
		'tells the user the method is not allowed for reason=%s, not to retry',
		(reason) => {
			expect(getOAuthErrorMessage('access_denied', reason)).toBe("This sign-in method isn't allowed for your account.");
		},
	);

	it('names the IdP-side cancellation distinctly from an app denial', () => {
		expect(getOAuthErrorMessage('oauth_failed', 'access_denied')).toBe('Sign-in was cancelled.');
	});

	it('falls back to the error-level message when reason is absent or unrecognized', () => {
		expect(getOAuthErrorMessage('invalid_request', null)).toBe(
			'Your sign-in link is invalid or has expired. Please try signing in again.',
		);
		expect(getOAuthErrorMessage('oauth_failed', 'server_temporarily_unavailable')).toBe(
			"The identity provider couldn't complete sign-in. Please try again.",
		);
	});

	it('falls back to the generic message for a wholly unrecognized error', () => {
		expect(getOAuthErrorMessage('something_new', null)).toBe(OAUTH_GENERIC_ERROR_MESSAGE);
		expect(getOAuthErrorMessage('something_new', 'also_new')).toBe(OAUTH_GENERIC_ERROR_MESSAGE);
	});

	it('never echoes the raw error/reason text into the returned message', () => {
		const rawReason = '<script>alert(1)</script>';
		const message = getOAuthErrorMessage('auth_failed', rawReason);
		expect(message).not.toContain(rawReason);
	});
});
