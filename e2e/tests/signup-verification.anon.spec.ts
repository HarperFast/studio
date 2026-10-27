import { expect, type Page, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { deleteSessionAccount, signupApiBase } from './accountCleanup';
import {
	deleteMailTo,
	mailConfigured,
	newTestEmailAddress,
	waitForSetPasswordEmail,
	waitForVerificationEmail,
} from './mail';

/**
 * Full email round-trip: sign up with a fresh controlled address → receive the
 * verification email via Mailosaur → follow its link → confirm the account is
 * verified by signing in without being bounced back to /#/verifying.
 *
 * A central-manager that replaces the sign-up password when verifying keeps the user on the page and
 * emails a set-password link instead. The spec follows whichever answer the target gives: sign in
 * with the sign-up password, or set a new one from that email first and sign in with it.
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
	//   6 navigations / waitForURL @30s ......... 180s   (goto x3, waitForURL x3)
	//   2 mail polls (mail.ts timeoutMs @90s) ... 180s   (verification, set-password)
	//   waitForResponse on signup (default) ...... 30s
	//   13 form actions @15s (actionTimeout) .... 195s
	//   verified-or-sign-in expect @30s .......... 30s
	//   3 expects @10s ........................... 30s
	//   2 cleanup API requests @30s .............. 60s
	//                                            ------
	//                                             705s
	// The set-password steps run only against a central-manager that sends that email, but the bound
	// has to hold for them. 840s keeps the invariant true with headroom. If you change any inner wait —
	// especially mail.ts's timeoutMs — re-do this sum.
	test.setTimeout(840_000);
	// Retries multiply that budget AND sign up another real account each time. Halve the project's
	// CI value, and preserve the local default of zero: `test.describe.configure` overrides the
	// project setting in EVERY environment, so a bare `retries: 1` would give local runs a retry
	// they don't have today — doubling the very cost this is meant to cap.
	test.describe.configure({ retries: process.env.CI ? 1 : 0 });

	const addressesUsed: string[] = [];
	test.afterAll(async () => {
		for (const address of addressesUsed) {
			await deleteMailTo(address);
		}
	});

	test('a new user can verify their email and sign in @roundtrip', async ({ page }) => {
		const email = newTestEmailAddress();
		addressesUsed.push(email);
		const password = randomPassword();
		const receivedAfter = new Date(Date.now() - 15_000);
		let accountApiBase: URL | undefined;

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
				page.waitForResponse((r) => r.request().method() === 'POST' && signupApiBase(r.url()) !== undefined),
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
			accountApiBase = signupApiBase(signupResponse.url());

			// 2. Success routes to the "check your email" screen for this address.
			await page.waitForURL(/#\/verifying/, { timeout: 30_000 });

			// 3. Fetch the verification email and follow its link.
			const { link } = await waitForVerificationEmail(email, { receivedAfter });
			const verifiedAfter = new Date(Date.now() - 15_000);
			await page.goto(link);

			// 4. Verifying the token lands the user back on sign-in, or stays to say the sign-up password
			//    was replaced. Then the password to sign in with is the one set from the email that
			//    verification sent.
			const signInButton = page.getByRole('button', { name: 'Sign In' });
			const verifiedHeading = page.getByRole('heading', { name: 'Email verified' });
			await expect(signInButton.or(verifiedHeading)).toBeVisible({ timeout: 30_000 });
			let signInPassword = password;
			if (await verifiedHeading.isVisible()) {
				// Any other verified state, such as the set-password email failing to send, fails here.
				await expect(page.getByText('Check your inbox to set your password.'), 'set-password email sent')
					.toBeVisible();
				const { link: setPasswordLink } = await waitForSetPasswordEmail(email, { receivedAfter: verifiedAfter });
				signInPassword = randomPassword();
				await page.goto(setPasswordLink);
				await page.getByLabel('New Password', { exact: true }).fill(signInPassword);
				await page.getByLabel('Confirm Password', { exact: true }).fill(signInPassword);
				await page.getByRole('button', { name: 'Submit New Password' }).click();
			}
			await page.waitForURL(/#\/sign-in/, { timeout: 30_000 });

			// 5. The real proof: logging in now succeeds instead of bouncing to
			//    /#/verifying (which is what an unverified account would do).
			await page.getByLabel('Email').fill(email);
			await page.getByLabel('Password', { exact: true }).fill(signInPassword);
			await page.getByRole('button', { name: 'Sign In' }).click();

			await page.waitForURL((url) => !url.hash.includes('/sign-in'), { timeout: 30_000 });
			await expect(page).not.toHaveURL(/#\/verifying/);
			await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
		} finally {
			// Runs on ANY exit once signup has created an account. Self-delete needs a logged-in
			// session, so a failure BEFORE login cannot delete it and is reported as a leak too.
			if (accountApiBase) {
				await deleteThrowawayAccount(page, accountApiBase, email);
			}
		}
	});
});

/**
 * Delete the throwaway account created above so the target environment doesn't accumulate
 * test users — allowed because the account owns the session (page.request shares the browser
 * context's cookies) and, being brand-new (no org), isn't the last admin of anything.
 *
 * A failure is a soft assertion: it fails the test, naming the leaked address, without replacing
 * whatever error the flow itself may already be throwing.
 */
async function deleteThrowawayAccount(page: Page, apiBase: URL, email: string): Promise<void> {
	try {
		const id = await deleteSessionAccount(page.request, apiBase);
		console.log(`[cleanup] deleted throwaway account ${id}`);
	} catch (err) {
		expect.soft(err, `[cleanup] throwaway account ${email} was NOT deleted from ${apiBase.origin}; delete it by hand`)
			.toBeUndefined();
	}
}
