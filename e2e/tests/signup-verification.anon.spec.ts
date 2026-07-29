import { expect, type Page, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
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
/**
 * A strong password, unique per run, that always satisfies the signup policy (upper + lower +
 * digit + symbol). Avoids committing a static credential to a public repo.
 */
function randomPassword(): string {
	return `Qa!${randomUUID().replace(/-/g, '').slice(0, 16)}Zz9`;
}

test.describe('signup → email verification → login', () => {
	test.skip(!mailConfigured, 'Mailosaur not configured (see e2e/.env.e2e).');

	// Email delivery + verification is slower than a normal UI assertion.
	// The outer timeout exists to catch a hang that no INNER timeout covers, so it must exceed the
	// sum of those inner budgets — otherwise a slow-but-progressing run trips it and reports a
	// failure while nothing actually timed out. The arithmetic, worst case:
	//   5 navigations / waitForURL @30s ......... 150s   (goto x2, waitForURL x3)
	//   mail poll (mail.ts timeoutMs) ............ 90s
	//   waitForResponse on signup (default) ...... 30s
	//   9 form actions @15s (actionTimeout) ..... 135s
	//   2 expects @10s ........................... 20s
	//   2 cleanup API requests @30s .............. 60s
	//                                            ------
	//                                             485s
	// 600s keeps the invariant true with headroom. (Earlier values of 120s and 210s did not: both
	// were below the sum, so a slow delivery read as a failure.) If you change any inner wait —
	// especially mail.ts's timeoutMs — re-do this sum.
	test.setTimeout(600_000);
	// Retries multiply that budget AND sign up another real account each time. Halve the project's
	// CI value, and preserve the local default of zero: `test.describe.configure` overrides the
	// project setting in EVERY environment, so a bare `retries: 1` would give local runs a retry
	// they don't have today — doubling the very cost this is meant to cap.
	test.describe.configure({ retries: process.env.CI ? 1 : 0 });

	test.afterAll(async () => {
		await deleteAllMail();
	});

	test('a new user can verify their email and sign in @roundtrip', async ({ page }) => {
		const email = newTestEmailAddress();
		const password = randomPassword();
		const receivedAfter = new Date(Date.now() - 15_000);

		// Wrap the WHOLE flow so cleanup runs even if an earlier step fails — otherwise a failure
		// after signup but before the final assertions would leak a throwaway account.
		try {
			// 1. Sign up.
			await page.goto('/#/sign-up');
			await page.getByLabel('First Name').fill('Qa');
			await page.getByLabel('Last Name').fill('Tester');
			await page.getByLabel('Email').fill(email);
			await page.getByLabel('Password', { exact: true }).fill(password);
			await page.getByLabel('Confirm Password', { exact: true }).fill(password);
			// The accept-terms checkbox is rendered twice; scope to the form's copy.
			await page.locator('#auth-signup-form').getByRole('checkbox').check();

			const [signupResponse] = await Promise.all([
				page.waitForResponse((r) => r.url().includes('/User/') && r.request().method() === 'POST'),
				page.getByRole('button', { name: 'Sign Up For Free' }).click(),
			]);

			// A 403 here is AMBIGUOUS: it can be the target's email-domain gate (central-manager
			// User.allowCreate → ALLOWLIST_EMAIL_DOMAINS not covering our Mailosaur domain), but it is
			// at least as likely to be a real authz/WAF/rate-limit regression. Skipping on it — as this
			// spec used to — makes the round-trip go permanently quiet the moment signup breaks, which
			// is precisely when a monitor should shout. So: FAIL by default, and require an explicit
			// opt-in for the known-misconfigured case (the monitored lanes never set it).
			if (signupResponse.status() === 403) {
				const detail = await signupResponse.text().catch(() => '');
				test.skip(
					process.env.E2E_ALLOW_SIGNUP_403_SKIP === '1',
					'Signup returned 403 and E2E_ALLOW_SIGNUP_403_SKIP=1 — treating as the known '
						+ `ALLOWLIST_EMAIL_DOMAINS gap. Server said: ${detail.slice(0, 200)}`,
				);
				throw new Error(
					'Signup returned 403. If this is the email-domain allowlist, add the Mailosaur server '
						+ "domain to the target's ALLOWLIST_EMAIL_DOMAINS (or set E2E_ALLOW_SIGNUP_403_SKIP=1 "
						+ `to skip deliberately). Otherwise this is a signup regression. Server said: ${detail.slice(0, 300)}`,
				);
			}
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
			await page.getByLabel('Password', { exact: true }).fill(password);
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
