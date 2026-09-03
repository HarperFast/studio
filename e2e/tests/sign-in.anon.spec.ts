import { expect, test } from '@playwright/test';

/**
 * Sign-in page — renders correctly, offers the three auth methods, and enforces
 * client-side validation. Runs unauthenticated; needs no test account.
 *
 * Selector notes (from the component map):
 *  - <form id="auth-signin-form">, inputs name="email"/"password" with labels.
 *  - Submit is a <button>Sign In</button>; OAuth options are <a> anchors.
 *  - Submit failures render inline as <p role="alert" data-slot="form-message">, not a toast.
 */
test.describe('sign-in page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/#/sign-in');
	});

	test('renders the sign-in form and all three auth methods', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Sign in to Harper Fabric' })).toBeVisible();

		await expect(page.getByLabel('Email')).toBeVisible();
		await expect(page.getByLabel('Password')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();

		// OAuth options render as links to server-side endpoints — assert the anchors
		// and their targets without leaving the origin.
		const google = page.getByRole('link', { name: 'Sign in with Google' });
		const github = page.getByRole('link', { name: 'Sign in with GitHub' });
		await expect(google).toBeVisible();
		await expect(github).toBeVisible();
		await expect(google).toHaveAttribute('href', /\/oauth\/google\/login/);
		await expect(github).toHaveAttribute('href', /\/oauth\/github\/login/);

		// Cross-links to the adjacent auth flows.
		await expect(page.getByRole('link', { name: 'Sign up for free' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
	});

	test('rejects an invalid email client-side (no network)', async ({ page }) => {
		await page.getByLabel('Email').fill('not-an-email');
		await page.getByLabel('Password').fill('something');
		await page.getByRole('button', { name: 'Sign In' }).click();

		// Zod validation blocks submit and the form stays put.
		await expect(page).toHaveURL(/#\/sign-in/);
		await expect(page.getByLabel('Email')).toBeVisible();
	});

	test('visual baseline of the sign-in page @visual', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Sign in to Harper Fabric' })).toBeVisible();
		// Baseline must be generated in the Linux container (see README) — commit
		// only the *-linux snapshot. Fonts/AA differ on macOS.
		await expect(page).toHaveScreenshot('sign-in.png', { fullPage: true });
	});
});
