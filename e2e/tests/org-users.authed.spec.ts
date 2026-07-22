import { expect, type Page, test } from '@playwright/test';

/**
 * Authenticated lane — the app shell after login and the org-users list.
 * Uses the stored session from auth.setup.ts (the `authed` project).
 *
 * Skips cleanly when no test account is configured, and when the account has no
 * accessible org / can't view org users on the target environment — so a data
 * difference between environments is a skip, not a red failure.
 */
const hasCreds = Boolean(process.env.PLAYWRIGHT_USER_EMAIL && process.env.PLAYWRIGHT_USER_PASSWORD);

// Hash first-segments that are NOT an organization id (auth screens, picker, profile…).
const RESERVED = new Set([
	'',
	'sign-in',
	'sign-up',
	'verifying',
	'verify-email',
	'forgot-password',
	'check-oauth',
	'profile',
	'new-org',
	'organizations',
]);

const firstSegment = (url: string): string => new URL(url).hash.replace(/^#\/?/, '').split(/[/?]/)[0];

test.describe('authenticated app', () => {
	test.skip(!hasCreds, 'No test account configured (see e2e/.env.e2e).');

	test('shows the authenticated shell (Sign Out present, not on sign-in)', async ({ page }) => {
		await page.goto('/#/');
		// The nav's Sign Out control carries aria-label="Sign Out" at any width;
		// its presence is the robust logged-in signal.
		await expect(page.getByLabel('Sign Out')).toBeVisible();
		await expect(page).not.toHaveURL(/#\/sign-in/);
	});

	test('org users list renders with the expected columns', async ({ page }) => {
		const orgId = await resolveOrgId(page);
		test.skip(
			!orgId,
			'No accessible organization for this account — add it to an org, or set PLAYWRIGHT_ORG_ID.',
		);

		await page.goto(`/#/${orgId}/users`);

		// The account may belong to the org but lack users-view permission, or the org
		// route may 403 on this environment. Wait for EITHER the table or the app's error
		// boundary, and skip cleanly on the latter rather than failing on a missing table.
		const table = page.getByRole('table');
		const errorBoundary = page.getByText('Component Error');
		await expect(table.or(errorBoundary).first()).toBeVisible();
		test.skip(
			await errorBoundary.isVisible().catch(() => false),
			`This account can't view org users for ${orgId} on this environment (403). Provision it as an `
				+ 'org member with users-view (Admin), or point PLAYWRIGHT_ORG_ID at one it can access.',
		);

		await expect(table).toBeVisible();
		for (const header of ['Email', 'Roles', 'Status']) {
			await expect(page.getByRole('columnheader', { name: header })).toBeVisible();
		}

		// TODO (next slice): assert the Resend-invite flow. Requires a PENDING user
		// fixture in the org — opening that user's detail modal (getByRole('dialog'))
		// surfaces getByRole('button', { name: 'Resend invite' }), which toasts
		// "Invitation resent to <email>." on success.
	});
});

/**
 * Resolve an org id the account can use. Prefers PLAYWRIGHT_ORG_ID; otherwise derives it
 * from the post-login landing: either a single-org redirect (`/#/` → `/#/<orgId>`) or the
 * first org-card link on the picker.
 *
 * The account's orgs load ASYNCHRONOUSLY into the picker, so we POLL for either signal
 * rather than reading the DOM once — under parallel load the org-card link can appear after
 * `networkidle`, which otherwise produced a flaky "no org" skip. Returns null only if nothing
 * shows up within the window (account truly has no accessible org → the spec skips).
 */
async function resolveOrgId(page: Page): Promise<string | null> {
	if (process.env.PLAYWRIGHT_ORG_ID) { return process.env.PLAYWRIGHT_ORG_ID; }

	await page.goto('/#/');
	await page.waitForLoadState('networkidle');

	for (let i = 0; i < 30; i++) { // up to ~15s
		const fromUrl = firstSegment(page.url());
		if (fromUrl && !RESERVED.has(fromUrl)) { return fromUrl; }

		const hrefs = await page.locator('a[href*="#/"]').evaluateAll((els) =>
			els.map((e) => e.getAttribute('href') ?? '')
		);
		for (const href of hrefs) {
			const m = href.match(/#\/([^/?#]+)/);
			if (m && !RESERVED.has(m[1])) { return m[1]; }
		}
		await page.waitForTimeout(500);
	}
	return null;
}
