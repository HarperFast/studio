import type { Page } from '@playwright/test';

/** Studio records each sign-in under its own localStorage key (`src/features/auth/store/signInMarkers.ts`). */
export const appSignInMarker = 'Studio:PotentiallyAuthenticated:OverallAppSignIn';

/** Marks the app signed in before the page loads, so it checks the mocked session instead of showing sign-in. */
export function rememberAppSignIn(page: Page) {
	return page.addInitScript((key) => localStorage.setItem(key, 'fixture'), appSignInMarker);
}
