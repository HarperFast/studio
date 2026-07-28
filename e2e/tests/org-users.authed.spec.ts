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
		// An unresolvable org used to skip. But resolveOrgId returns null for ANY failure to observe
		// one — a broken single-org redirect, an org picker that stopped rendering, a failing orgs
		// query — i.e. exactly the regressions this spec exists to catch, silently turned green. The
		// account IS configured (the describe skips otherwise), so treat it as a failure. Local dev
		// against an account that genuinely has no org can opt out.
		const orgId = await resolveOrgId(page);
		if (!orgId) {
			test.skip(
				!!process.env.E2E_ALLOW_NO_ORG,
				'No organization resolved and E2E_ALLOW_NO_ORG is set — treating this account as org-less.',
			);
			throw new Error(
				'Could not resolve an organization for this account within 15s: no single-org redirect and '
					+ 'no org link on the picker. That is usually a regression in post-login landing or the org '
					+ 'picker — not a missing org. Pin PLAYWRIGHT_ORG_ID, or set E2E_ALLOW_NO_ORG=1 if this '
					+ 'account genuinely belongs to no organization.',
			);
		}

		// Watch for a 403 during the org-users load. That — NOT the generic error boundary — is the
		// real "no permission" signal. The app's `Component Error` boundary renders for ANY uncaught
		// error on the route, so skipping on its text alone would hide a genuine break (JS exception,
		// broken query, API error) on exactly the page this spec exists to cover.
		let saw403 = false;
		page.on('response', (r) => {
			// Scope to the org-users data fetch: GET /OrganizationRole/{orgId} — the page's ONLY suspense
			// query (the user list is derived from its response). An unrelated 403 (telemetry, a
			// feature-flag check, or the roles query's 10s refetch racing something else) must NOT flip
			// this and mask a real render crash.
			if (r.status() === 403 && r.url().includes('/OrganizationRole/')) { saw403 = true; }
		});

		await page.goto(`/#/${orgId}/users`);

		// Wait for EITHER the users table or the app's error boundary.
		const table = page.getByRole('table');
		const errorBoundary = page.getByText('Component Error');
		await expect(table.or(errorBoundary).first()).toBeVisible();

		if (await errorBoundary.isVisible().catch(() => false)) {
			// A 403 → this account legitimately lacks users-view on this env: skip, don't fail red.
			test.skip(
				saw403,
				`This account can't view org users for ${orgId} on this environment (403). Provision it as `
					+ 'an org member with users-view (Admin), or point PLAYWRIGHT_ORG_ID at one it can access.',
			);
			// Error boundary but NO 403 → the page genuinely broke. Fail red so the suite catches it.
			expect(
				saw403,
				`org-users hit its error boundary with no 403 for ${orgId} — a real failure, not a permission skip`,
			).toBe(true);
		}

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

	// Read either signal once: a single-org URL redirect, or the first org-card link on the picker.
	const readOrgId = async (): Promise<string | null> => {
		const fromUrl = firstSegment(page.url());
		if (fromUrl && !RESERVED.has(fromUrl)) { return fromUrl; }

		const hrefs = await page.locator('a[href*="#/"]').evaluateAll((els) =>
			els.map((e) => e.getAttribute('href') ?? '')
		);
		for (const href of hrefs) {
			const m = href.match(/#\/([^/?#]+)/);
			if (m && !RESERVED.has(m[1])) { return m[1]; }
		}
		return null;
	};

	// The account's orgs load ASYNCHRONOUSLY into the picker, so poll rather than reading once (under
	// parallel load the org-card link can appear after `networkidle`). expect.poll auto-waits — no
	// manual waitForTimeout anti-pattern; on timeout the account truly has no accessible org → null.
	let orgId: string | null = null;
	try {
		await expect.poll(async () => (orgId = await readOrgId()), {
			timeout: 15_000,
			intervals: [250, 500, 500, 1000],
		}).not.toBeNull();
	} catch {
		// timed out — nothing showed up in the window
	}
	return orgId;
}
