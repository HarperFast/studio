import { expect, type Page, test } from '@playwright/test';
import { deleteAllMail, mailConfigured, newTestEmailAddress, waitForVerificationEmail } from './mail';

/**
 * Full email round-trip: sign up with a fresh controlled address → receive the
 * verification email via Mailosaur → follow its link → confirm the account is
 * verified by signing in without being bounced back to /#/verifying.
 *
 * Runs in the `anon` project (starts logged-out; it creates and then logs into a
 * brand-new account within the test). Skips cleanly until Mailosaur is configured.
 *
 * NOTE: each run creates a real account on the target (dev) environment — see the
 * account-churn note in README before wiring this into a daily/CI loop.
 */
const PASSWORD = 'SuperSecret123!';

test.describe('signup → email verification → login', () => {
	test.skip(!mailConfigured, 'Mailosaur not configured (see e2e/.env.e2e).');

	// Email delivery + verification is slower than a normal UI assertion.
	test.setTimeout(120_000);

	test.afterAll(async () => {
		await deleteAllMail();
	});

	test('a new user can verify their email and sign in @roundtrip', async ({ page }) => {
		const email = newTestEmailAddress();
		const receivedAfter = new Date(Date.now() - 15_000);

		// Wrap the WHOLE flow so cleanup runs even if an earlier step fails — otherwise a failure
		// after signup but before the final assertions would leak a throwaway account.
		try {
			// 1. Sign up.
			await page.goto('/#/sign-up');
			await page.getByLabel('First Name').fill('Qa');
			await page.getByLabel('Last Name').fill('Tester');
			await page.getByLabel('Email').fill(email);
			await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
			await page.getByLabel('Confirm Password', { exact: true }).fill(PASSWORD);
			// The accept-terms checkbox is rendered twice; scope to the form's copy.
			await page.locator('#auth-signup-form').getByRole('checkbox').check();

			const [signupResponse] = await Promise.all([
				page.waitForResponse((r) => r.url().includes('/User/') && r.request().method() === 'POST'),
				page.getByRole('button', { name: 'Sign Up For Free' }).click(),
			]);

			// Some environments gate signup to specific email domains (central-manager
			// User.allowCreate → ALLOWLIST_EMAIL_DOMAINS). If the target hasn't allowlisted
			// our Mailosaur server domain, skip rather than fail red — the test starts
			// passing automatically once the domain is allowlisted.
			test.skip(
				signupResponse.status() === 403,
				"Signup returned 403 — the target env's ALLOWLIST_EMAIL_DOMAINS doesn't include the Mailosaur "
					+ 'server domain. Add it (or use a Mailosaur custom domain under an allowlisted domain) to enable this test.',
			);
			expect(signupResponse.status(), 'POST /User/ (signup)').toBeLessThan(400);

			// 2. Success routes to the "check your email" screen for this address.
			await page.waitForURL(/#\/verifying/, { timeout: 30_000 });

			// 3. Fetch the verification email and follow its link.
			const { link } = await waitForVerificationEmail(email, { receivedAfter });
			await page.goto(link);

			// 4. Verifying the token lands the user back on sign-in.
			await page.waitForURL(/#\/sign-in/, { timeout: 30_000 });

			// 5. The real proof: logging in now succeeds instead of bouncing to
			//    /#/verifying (which is what an unverified account would do).
			await page.getByLabel('Email').fill(email);
			await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
			await page.getByRole('button', { name: 'Sign In' }).click();

			await page.waitForURL((url) => !url.hash.includes('/sign-in'), { timeout: 30_000 });
			await expect(page).not.toHaveURL(/#\/verifying/);
			await expect(page.getByLabel('Sign Out')).toBeVisible();
		} finally {
			// Best-effort cleanup on ANY exit. Self-delete needs a logged-in session, so a failure
			// BEFORE login has no session and nothing to delete (no-op); a failure at/after login is
			// still cleaned up. Never fails the test (see deleteThrowawayAccount).
			await deleteThrowawayAccount(page);
		}
	});
});

/**
 * Delete the throwaway account created above so the target environment doesn't accumulate
 * test users. Uses the logged-in session (page.request shares the browser context's cookies):
 * GET /User/current for the account id, then self-DELETE /User/{id} — allowed because the
 * account owns the session and, being brand-new (no org), isn't the last admin of anything.
 * Best-effort: a cleanup failure never fails the test.
 */
async function deleteThrowawayAccount(page: Page): Promise<void> {
	try {
		const meRes = await page.request.get('/User/current');
		if (!meRes.ok()) {
			console.warn(`[cleanup] GET /User/current -> ${meRes.status()}; leaving account`);
			return;
		}
		const { id } = await meRes.json();
		if (!id) {
			console.warn('[cleanup] no account id on /User/current; leaving account');
			return;
		}
		const delRes = await page.request.delete(`/User/${id}`);
		if (delRes.ok()) {
			console.log(`[cleanup] deleted throwaway account ${id}`);
		} else {
			console.warn(`[cleanup] DELETE /User/${id} -> ${delRes.status()}; leaving account`);
		}
	} catch (err) {
		console.warn('[cleanup] account cleanup failed (non-fatal):', err);
	}
}
