import { apiClient } from '@/config/apiClient';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { makeUnauthorizedResponseHandler } from '@/lib/unauthorizedResponseHandler';

/**
 * Install the 401 -> clear-auth interceptor on the CM api client. Call once at
 * app startup, before React mounts. On a lost session the cached cloud user is
 * cleared, which re-runs the route guards and redirects to /sign-in.
 */
export function installApiUnauthorizedRedirect(): void {
	apiClient.interceptors.response.use(
		(response) => response,
		makeUnauthorizedResponseHandler(() => authStore.setUserForEntity(OverallAppSignIn, null)),
	);
}
