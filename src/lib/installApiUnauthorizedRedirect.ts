import { apiClient } from '@/config/apiClient';
import { clearAuthStateLocally } from '@/features/auth/handlers/clearAuthStateLocally';
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

// Config key stamped by the request interceptor with the cloud identity at send
// time, so the response handler can tell whether the session has changed since.
const AUTH_STAMP = 'authUserAtSend';

// The cloud user's stable id, or null when signed out. LocalUser has no id.
function currentCloudUserId(): string | null {
	const user = authStore.getConnectionById(OverallAppSignIn).user;
	return user && 'id' in user ? user.id : null;
}

let installed = false;

/**
 * Install the 401 -> clear-auth interceptor on the CM api client. Call once at
 * app startup, before React mounts; re-installs (HMR) are no-ops so duplicate
 * interceptors can't stack. On a lost session the cached auth is fully cleared
 * (locally), which re-runs the route guards and redirects to /sign-in.
 */
export function installApiUnauthorizedRedirect(): void {
	if (installed) {
		return;
	}
	installed = true;

	// Stamp each request with the cloud identity at send time (see AUTH_STAMP).
	apiClient.interceptors.request.use((config) => {
		(config as typeof config & { [AUTH_STAMP]?: string | null })[AUTH_STAMP] = currentCloudUserId();
		return config;
	});

	apiClient.interceptors.response.use(
		(response) => response,
		makeUnauthorizedResponseHandler(
			clearAuthStateLocally,
			(url) => AUTH_FLOW_PATHS.some((path) => url.startsWith(path)),
			// Only clear if the identity hasn't changed since the request was sent —
			// don't let a slow 401 from the old session clear a fresh re-login.
			(config) =>
				(config as (typeof config & { [AUTH_STAMP]?: string | null }) | undefined)?.[AUTH_STAMP]
					=== currentCloudUserId(),
		),
	);
}
