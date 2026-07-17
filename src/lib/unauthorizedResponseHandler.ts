import type { AxiosError } from 'axios';

/**
 * Build an axios response-error handler that runs `clearAuth` on a 401.
 *
 * A 401 from the CM API means the cloud session is gone — expired, revoked, or
 * (for fabric admins) past its configured max age. Clearing the cached auth lets
 * the route guards re-run and redirect to /sign-in, instead of leaving the SPA
 * on a stale user while every data call fails until a manual refresh.
 *
 * Only 401 (unauthenticated) is treated as a lost session. 403 is deliberately
 * left alone: it is a legitimate "authenticated but not permitted" response and
 * must not sign the user out.
 *
 * Kept free of app imports (auth store, api client) so it unit-tests in the
 * default node env without pulling in browser-only globals.
 */
export function makeUnauthorizedResponseHandler(clearAuth: () => void) {
	return (error: AxiosError): Promise<never> => {
		// `error?.`: axios itself always rejects with an AxiosError, but an upstream
		// interceptor added later could reject with anything (even undefined) — don't
		// let this handler replace the rejection reason with its own TypeError.
		if (error?.response?.status === 401) {
			clearAuth();
		}
		// Re-reject so individual callers still see (and can handle) the error.
		return Promise.reject(error);
	};
}
