import { clearAuthStateAfterSignOutElsewhere } from '@/features/auth/handlers/clearAuthStateLocally';
import { authStore } from '@/features/auth/store/authStore';

let installed = false;

export function installCrossTabSignOut(): void {
	if (installed) {
		return;
	}
	authStore.onAppSignedOutElsewhere(clearAuthStateAfterSignOutElsewhere);
	installed = true;
}
