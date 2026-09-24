import { expect, test } from '@playwright/test';

const user = { id: 'profile-user', email: 'profile@example.test', firstname: 'Taylor', lastname: 'River', roles: {} };

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() =>
		localStorage.setItem('Studio:PotentiallyAuthenticated', JSON.stringify({ OverallAppSignIn: 'fixture' }))
	);
	await page.route(
		'**/*',
		route =>
			['fetch', 'xhr'].includes(route.request().resourceType())
				? route.fulfill({ status: 404, json: {} })
				: route.continue(),
	);
	await page.route('**/User/current', route => route.fulfill({ json: user }));
	await page.routeWebSocket('**/*', socket => socket.close());
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`profile stays usable on desktop and mobile in ${colorScheme} mode`, async ({ page }, testInfo) => {
		await page.emulateMedia({ colorScheme });
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto('/#/profile');
		await expect(page.getByRole('heading', { name: 'Personal information' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Password', exact: true })).toBeVisible();
		await expect(page.getByLabel('Email', { exact: true })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
		await page.screenshot({ path: testInfo.outputPath(`profile-${colorScheme}.png`), fullPage: true });
		await page.setViewportSize({ width: 390, height: 844 });
		for (const label of ['First Name', 'Last Name', 'Email', 'New Password', 'Confirm New Password']) {
			const field = page.getByLabel(label, { exact: true });
			await expect(field).toBeVisible();
			const box = await field.boundingBox();
			expect(box!.x).toBeGreaterThanOrEqual(0);
			expect(box!.x + box!.width).toBeLessThanOrEqual(390);
		}
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		await page.screenshot({ path: testInfo.outputPath(`profile-${colorScheme}-mobile.png`), fullPage: true });
	});
}

test('saving personal information sends only names and resets the save state', async ({ page }) => {
	let payload: unknown;
	await page.route('**/User/profile-user', async route => {
		payload = route.request().postDataJSON();
		await route.fulfill({ json: { ...user, firstname: 'Morgan' } });
	});
	await page.goto('/#/profile');
	await page.getByLabel('First Name', { exact: true }).fill('Morgan');
	await expect(page.getByText('You have unsaved changes.')).toBeVisible();
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByText('Profile updated successfully!')).toBeVisible();
	expect(payload).toEqual({ firstname: 'Morgan', lastname: 'River' });
	await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
});

test('password confirmation gates save and a password update returns to sign-in', async ({ page }) => {
	let payload: unknown;
	await page.route('**/User/profile-user', async route => {
		payload = route.request().postDataJSON();
		await route.fulfill({ json: user });
	});
	await page.goto('/#/profile');
	await page.getByLabel('New Password', { exact: true }).fill('Test-password-123');
	await page.getByLabel('Confirm New Password', { exact: true }).fill('different-password');
	await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
	await page.getByLabel('Confirm New Password', { exact: true }).fill('Test-password-123');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page).toHaveURL(/#\/sign-in/);
	expect(payload).toEqual({ firstname: 'Taylor', lastname: 'River', password: 'Test-password-123' });
});
