import { expect, test } from '@playwright/test';

/**
 * Authenticated lane — the app shell after login and the org-users list.
 * Uses the stored session from auth.setup.ts (the `authed` project).
 *
 * Skips cleanly when no test account is configured, so the suite stays green
 * until credentials land in e2e/.env.e2e.
 */
const hasCreds = Boolean(process.env.PLAYWRIGHT_USER_EMAIL && process.env.PLAYWRIGHT_USER_PASSWORD);

test.describe('authenticated app', () => {
	test.skip(!hasCreds, 'No test account configured (see e2e/.env.e2e).');

	test('shows the authenticated shell (Sign Out present, not on sign-in)', async ({ page }) => {
		await page.goto('/#/');
		// The nav's Sign Out control carries aria-label="Sign Out" at any width;
		// its presence (and a Sign In link's absence) is the robust logged-in signal.
		await expect(page.getByLabel('Sign Out')).toBeVisible();
		await expect(page).not.toHaveURL(/#\/sign-in/);
	});

	test('org users list renders with the expected columns', async ({ page }) => {
		const orgId = await resolveOrgId(page);
		test.skip(
			!orgId,
			'Could not resolve an org id from the landing URL — set PLAYWRIGHT_ORG_ID in e2e/.env.e2e.',
		);

		await page.goto(`/#/${orgId}/users`);

		// Real <table> from SimpleBrowseDataTable — assert the header row.
		const table = page.getByRole('table');
		await expect(table).toBeVisible();
		for (const header of ['Email', 'Roles', 'Status']) {
			await expect(page.getByRole('columnheader', { name: header })).toBeVisible();
		}

		// TODO (next slice): assert the Resend-invite flow. Requires a PENDING user
		// fixture in the org — opening that user's detail modal
		// (getByRole('dialog')) surfaces getByRole('button', { name: 'Resend invite' }),
		// which toasts "Invitation resent to <email>." on success.
	});
});

/** Prefer an explicit org id; otherwise derive it from the post-login landing URL. */
async function resolveOrgId(page: import('@playwright/test').Page): Promise<string | null> {
	if (process.env.PLAYWRIGHT_ORG_ID) { return process.env.PLAYWRIGHT_ORG_ID; }

	await page.goto('/#/');
	await page.waitForLoadState('networkidle');

	// Single-org accounts land on /#/<orgId>. Reserved first segments mean we're
	// on the org picker or an auth screen instead.
	const reserved = new Set([
		'',
		'sign-in',
		'sign-up',
		'verifying',
		'verify-email',
		'forgot-password',
		'check-oauth',
		'profile',
	]);
	const segment = new URL(page.url()).hash.replace(/^#\/?/, '').split(/[/?]/)[0];
	return reserved.has(segment) ? null : segment;
}
