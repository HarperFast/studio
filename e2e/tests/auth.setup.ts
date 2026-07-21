import { expect, test as setup } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This file lives in tests/ (so the `setup` project's testMatch finds it), but
// the auth state lives at the e2e root — one level up — to match the
// storageState path in playwright.config.ts.
const dir = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(dir, '..', '.auth', 'user.json');

const email = process.env.PLAYWRIGHT_USER_EMAIL;
const password = process.env.PLAYWRIGHT_USER_PASSWORD;

/**
 * Logs in through the real UI once and persists the session (the cookie set by
 * POST /Login/ — the localStorage `Studio:PotentiallyAuthenticated` flag is only
 * a hint, so cookie-bearing storageState is what actually authenticates).
 *
 * Doubles as the sign-in happy-path smoke test.
 *
 * When no credentials are configured, we write an empty storage state so the
 * `authed` project can still load, and the authed specs skip themselves with a
 * clear message. That way `pnpm test` runs green out of the box (anon specs) and
 * unlocks the credentialed lane the moment a test account lands in .env.e2e.
 */
setup('authenticate', async ({ page }) => {
	fs.mkdirSync(path.dirname(authFile), { recursive: true });

	if (!email || !password) {
		fs.writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }));
		setup.skip(
			true,
			'No PLAYWRIGHT_USER_EMAIL / PLAYWRIGHT_USER_PASSWORD set — skipping login. '
				+ 'Add a disposable test account to e2e/.env.e2e to enable the authed lane.',
		);
		return;
	}

	await page.goto('/#/sign-in');

	// Stable form wiring: <form id="auth-signin-form">, inputs name="email"/"password",
	// labels "Email"/"Password", submit button "Sign In".
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign In' }).click();

	// Success = navigated off the sign-in route. Landing varies (single org ->
	// /#/<orgId>, else the org picker /#/), so assert we left sign-in rather than
	// a specific destination.
	await page.waitForURL((url) => !url.hash.includes('/sign-in'), { timeout: 30_000 });
	await expect(page).not.toHaveURL(/#\/sign-in/);

	await page.context().storageState({ path: authFile });
});
