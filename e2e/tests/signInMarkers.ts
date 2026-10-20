import type { Page } from '@playwright/test';

/** Must match `signInMarkerKey(OverallAppSignIn)` in `src/features/auth/store/signInMarkers.ts`, which e2e can't import. */
export const appSignInMarker = 'Studio:PotentiallyAuthenticated:OverallAppSignIn';

/** Marks the app signed in before the page loads, so it checks the mocked session instead of showing sign-in. */
export function rememberAppSignIn(page: Page) {
	return page.addInitScript((key) => localStorage.setItem(key, 'fixture'), appSignInMarker);
}
