import { apiClient } from '@/config/apiClient';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { makeUnauthorizedResponseHandler } from '@/lib/unauthorizedResponseHandler';

// The unauthenticated auth flows 401 for a bad credential or a stale
// reset/verify token (CM's verifyToken), not for a lost session — a stale
// email link opened in a second tab must not sign out a live session.
const AUTH_FLOW_PATHS = [
	'/Login/',
	'/ForgotPassword/',
	'/ResetPassword/',
	'/VerifyEmail/',
	'/ResendVerificationEmail/',
];

let installed = false;

/**
 * Install the 401 -> clear-auth interceptor on the CM api client. Call once at
 * app startup, before React mounts; re-installs (HMR) are no-ops so duplicate
 * interceptors can't stack. On a lost session the cached cloud user is
 * cleared, which re-runs the route guards and redirects to /sign-in.
 */
export function installApiUnauthorizedRedirect(): void {
	if (installed) {
		return;
	}
	installed = true;
	apiClient.interceptors.response.use(
		(response) => response,
		makeUnauthorizedResponseHandler(
			() => authStore.setUserForEntity(OverallAppSignIn, null),
			(url) => AUTH_FLOW_PATHS.some((path) => url.startsWith(path)),
		),
	);
}
