import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

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
 * must not sign the user out. `isExemptUrl` lets the installer skip endpoints
 * whose 401s mean "bad credentials/token" rather than a lost session (the
 * unauthenticated auth flows). `isStillCurrent` guards the auth-generation race:
 * a slow 401 from a request sent under the OLD session must not clear a session
 * the user has since re-established (A expires → 401 → re-login as B → B's
 * earlier in-flight request 401s and would otherwise sign B out).
 *
 * Kept free of app imports (auth store, api client) so it unit-tests in the
 * default node env without pulling in browser-only globals.
 */
export function makeUnauthorizedResponseHandler(
	clearAuth: () => void,
	isExemptUrl: (url: string) => boolean = () => false,
	isStillCurrent: (config: InternalAxiosRequestConfig | undefined) => boolean = () => true,
) {
	return (error: AxiosError): Promise<never> => {
		// `error?.`: axios itself always rejects with an AxiosError, but an upstream
		// interceptor added later could reject with anything (even undefined) — don't
		// let this handler replace the rejection reason with its own TypeError.
		if (
			error?.response?.status === 401
			&& !isExemptUrl(error.config?.url ?? '')
			&& isStillCurrent(error.config)
		) {
			clearAuth();
		}
		// Re-reject so individual callers still see (and can handle) the error.
		return Promise.reject(error);
	};
}
