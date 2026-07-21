import { expect, test } from '@playwright/test';
import { UNVERIFIED_EMAIL } from './testData';

/**
 * Email-verification landing screen (`/#/verifying`) — the destination the
 * unverified-login flow (commits 424c0977 / 744de9e3) routes users to.
 *
 * We drive the screen directly via its `?email=` param, so this needs no account
 * and no inbox. The *full* round-trip (receive email -> click /#/verify-email
 * ?token= link) is deferred to the credentialed lane once a dedicated test inbox
 * exists — verification is link/token-based, there is no numeric code to type.
 */
test.describe('email-verification screen', () => {
	test('shows the check-your-email screen with both actions', async ({ page }) => {
		await page.goto('/#/verifying?email=' + encodeURIComponent(UNVERIFIED_EMAIL));

		await expect(page.getByRole('heading', { name: /Check your email/i })).toBeVisible();

		// The two stable actions (copy around them is decorative).
		await expect(page.getByRole('link', { name: 'I did it, let me sign in!' })).toBeVisible();
		await expect(page.getByRole('link', { name: /Send me another code/i })).toBeVisible();
	});

	test('the verify-email page prompts for an email when opened without a token', async ({ page }) => {
		await page.goto('/#/verify-email');

		await expect(page.getByRole('heading', { name: 'Verify Email' })).toBeVisible();
		await expect(page.getByLabel('Email')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Send Verification Email' })).toBeVisible();
	});
});
