import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() =>
		localStorage.setItem('Studio:PotentiallyAuthenticated', JSON.stringify({ OverallAppSignIn: 'fixture' }))
	);
	await page.route(
		'**/User/current',
		route =>
			route.fulfill({
				json: {
					id: 'usr-help',
					email: 'help@example.test',
					roles: { 'org-help': { organizationName: 'Help test', role: 'owner', permission: { super_user: true } } },
				},
			}),
	);
	await page.route(
		'**/Organization/*',
		route =>
			route.fulfill({
				json: {
					id: 'org-help',
					name: 'Help test',
					clusters: [{
						id: 'clu-help',
						name: 'Production',
						organizationId: 'org-help',
						status: 'RUNNING',
						fqdn: 'example.test',
					}],
				},
			}),
	);
	await page.route(
		'**/Cluster/*',
		route =>
			route.fulfill({
				json: { id: 'clu-help', name: 'Production', organizationId: 'org-help', status: 'RUNNING', instances: [] },
			}),
	);
	await page.route('**/Region/**', route => route.fulfill({ json: [] }));
	await page.route('**/SystemStatus/**', route => route.fulfill({ json: [] }));
	await page.routeWebSocket('**/*', socket => socket.close());
});

for (const path of ['/#/org-help', '/#/org-help/clu-help']) {
	test(`help uses spare rail space and yields to navigation on ${path}`, async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 1100 });
		await page.goto(path);
		const help = page.getByRole('region', { name: 'Need help?' });
		await expect(help).toBeVisible();
		await expect(help.getByRole('link', { name: 'View docs' })).toHaveAttribute(
			'href',
			'https://docs.harperdb.io/docs',
		);
		await expect(help.getByRole('link', { name: 'Join Discord' })).toHaveAttribute('rel', 'noopener noreferrer');
		const nav = page.locator('.section-rail-navigation');
		const navBox = await nav.boundingBox();
		const helpBox = await help.boundingBox();
		expect(helpBox!.y).toBeGreaterThan(navBox!.y + navBox!.height);
		await page.setViewportSize({ width: 1440, height: 500 });
		await expect(help).toBeHidden();
		await expect(nav).toBeVisible();
		await page.setViewportSize({ width: 390, height: 844 });
		await expect(help).toBeHidden();
		await expect(nav).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	});
}
