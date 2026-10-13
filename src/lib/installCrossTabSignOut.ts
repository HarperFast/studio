import { clearAuthStateAfterSignOutElsewhere } from '@/features/auth/handlers/clearAuthStateLocally';
import { authStore } from '@/features/auth/store/authStore';

let installed = false;

/**
 * Sign this tab out when another tab signs the app out, the way `installApiUnauthorizedRedirect` does on a
 * central-manager 401: the cleared state re-runs the route guards, which redirect to /sign-in. Without it the
 * tab stays on its page until a request fails on the ended session and toasts central manager's 403. Call
 * once at startup; a second call (HMR) is a no-op.
 */
export function installCrossTabSignOut(): void {
	if (installed) {
		return;
	}
	installed = true;
	authStore.onAppSignedOutElsewhere(clearAuthStateAfterSignOutElsewhere);
}
