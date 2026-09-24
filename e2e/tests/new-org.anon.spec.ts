import { expect, test } from '@playwright/test';

const user = { id: 'new-org-user', email: 'org@example.test', firstname: 'Taylor', lastname: 'River', roles: {} };

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() =>
		localStorage.setItem('Studio:PotentiallyAuthenticated', JSON.stringify({ OverallAppSignIn: 'fixture' }))
	);
	await page.route('**/*', route =>
		['fetch', 'xhr'].includes(route.request().resourceType())
			? route.fulfill({ status: 404, json: {} })
			: route.continue());
	await page.route('**/User/current', route => route.fulfill({ json: user }));
	await page.routeWebSocket('**/*', socket => socket.close());
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`new organization fits desktop and mobile in ${colorScheme} mode`, async ({ page }, testInfo) => {
		await page.emulateMedia({ colorScheme });
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto('/#/new-org');
		await expect(page.locator('html')).toHaveClass(colorScheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
		await expect(page.getByRole('heading', { name: 'Create an organization' })).toBeVisible();
		await expect(page.getByTestId('org-hostname-preview')).toHaveText(
			'future-cluster-names.taylor-river-org.harperfabric.com',
		);
		await page.screenshot({ path: testInfo.outputPath(`new-org-${colorScheme}.png`), fullPage: true });
		await page.setViewportSize({ width: 390, height: 844 });
		await page.getByLabel('Subdomain', { exact: true }).fill('a'.repeat(62));
		for (
			const target of [
				page.getByLabel('Name', { exact: true }),
				page.getByLabel('Subdomain', { exact: true }),
				page.getByRole('button', { name: 'Create organization', exact: true }),
				page.getByTestId('org-hostname-preview'),
			]
		) {
			const box = await target.boundingBox();
			expect(box!.x).toBeGreaterThanOrEqual(0);
			expect(box!.x + box!.width).toBeLessThanOrEqual(390);
		}
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		await page.getByLabel('Subdomain', { exact: true }).fill('');
		await page.screenshot({ path: testInfo.outputPath(`new-org-${colorScheme}-mobile.png`), fullPage: true });
	});
}

for (const custom of [false, true]) {
	test(`creation preserves ${custom ? 'custom' : 'default'} values and pending state`, async ({ page }) => {
		let payload: unknown;
		let release!: () => void;
		const held = new Promise<void>(resolve => {
			release = resolve;
		});
		await page.route('**/Organization/', async route => {
			payload = route.request().postDataJSON();
			await held;
			await route.fulfill({ status: 409, json: { message: 'This subdomain is already in use.' } });
		});
		await page.goto('/#/new-org');
		if (custom) {
			await page.getByLabel('Name', { exact: true }).fill('Test Team');
			await expect(page.getByTestId('org-hostname-preview')).toContainText('.test-team.harperfabric.com');
			await page.getByLabel('Subdomain', { exact: true }).fill('team-custom');
			await expect(page.getByTestId('org-hostname-preview')).toContainText('.team-custom.harperfabric.com');
		}
		await page.getByRole('button', { name: 'Create organization', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Creating organization…' })).toBeDisabled();
		await expect.poll(() => payload).toEqual(
			custom
				? { name: 'Test Team', subdomain: 'team-custom' }
				: { name: 'Taylor River Org', subdomain: 'taylor-river-org' },
		);
		release();
		await expect(page.getByRole('button', { name: 'Create organization', exact: true })).toBeEnabled();
		await expect(page.getByText('This subdomain is already in use.', { exact: false })).toBeVisible();
	});
}

test('invalid subdomains are rejected before sending a request', async ({ page }) => {
	let requests = 0;
	await page.route('**/Organization/', route => {
		requests++;
		return route.fulfill({ status: 500, json: {} });
	});
	await page.goto('/#/new-org');
	await page.getByLabel('Subdomain', { exact: true }).fill('-invalid');
	await page.getByRole('button', { name: 'Create organization', exact: true }).click();
	await expect(page.getByText('Please only use lowercase letters', { exact: false })).toBeVisible();
	expect(requests).toBe(0);
});
