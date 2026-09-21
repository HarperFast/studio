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
		await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

		await expect(page.getByLabel('Email')).toBeVisible();
		await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
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
		await page.getByLabel('Password', { exact: true }).fill('something');
		await page.getByRole('button', { name: 'Sign In' }).click();

		// Zod validation blocks submit and the form stays put.
		await expect(page).toHaveURL(/#\/sign-in/);
		await expect(page.getByLabel('Email')).toBeVisible();
	});

	test('focuses the first invalid field after submitting an empty form', async ({ page }) => {
		await page.getByRole('button', { name: 'Sign In', exact: true }).click();
		const email = page.getByLabel('Email', { exact: true });
		await expect(email).toHaveAttribute('aria-invalid', 'true');
		await expect(email).toBeFocused();
		await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('aria-invalid', 'true');
		await expect(page).toHaveURL(/#\/sign-in/);
	});

	test('reveals and hides the password without submitting', async ({ page }) => {
		const password = page.getByLabel('Password', { exact: true });
		await password.fill('visibility-test-only');
		await page.getByRole('button', { name: 'Show password', exact: true }).click();
		await expect(password).toHaveAttribute('type', 'text');
		await expect(password).toHaveValue('visibility-test-only');
		await page.getByRole('button', { name: 'Hide password', exact: true }).click();
		await expect(password).toHaveAttribute('type', 'password');
		await expect(password).toHaveValue('visibility-test-only');
		await expect(page).toHaveURL(/#\/sign-in/);
	});

	for (const theme of ['Light', 'Dark'] as const) {
		test(`keeps the GitHub button readable on hover in ${theme.toLowerCase()} mode`, async ({ page }) => {
			await page.getByRole('button', { name: theme, exact: true }).click();
			const github = page.getByRole('link', { name: 'Sign in with GitHub' });
			await github.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
			const background = await github.evaluate(element => getComputedStyle(element).backgroundColor);
			await github.hover();
			await github.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
			await expect(github).toHaveCSS('background-color', background);
		});

		test(`visual baseline of the ${theme.toLowerCase()} sign-in page @visual`, async ({ page }) => {
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
			await page.getByRole('button', { name: theme, exact: true }).click();
			await expect(page.getByRole('img', { name: /App, database, cache, and messaging together/ }))
				.toHaveAttribute('src', `/auth/fabric-hero-${theme.toLowerCase()}-wide.png`);
			await expect(page).toHaveScreenshot(`sign-in-${theme.toLowerCase()}.png`, {
				fullPage: true,
				// The external CAPTCHA badge varies by host and network availability.
				mask: [page.locator('.grecaptcha-badge')],
			});
		});
	}
});
