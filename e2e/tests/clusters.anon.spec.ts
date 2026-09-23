import { expect, test } from '@playwright/test';

const clusters = [
	{ id: 'clu-production', name: 'Production', status: 'RUNNING', region: 'US East' },
	{ id: 'clu-staging', name: 'Staging', status: 'FAILED', region: 'US West' },
].map(({ region, ...cluster }) => ({
	...cluster,
	organizationId: 'org-fixture',
	fqdn: `${cluster.id}.example.test`,
	plans: [{ planId: 'shared', regionId: region === 'US East' ? 'reg-east' : 'reg-west' }],
}));

// Deliberately omit nested instances: the organization list need not expand that relationship.
const organization = { id: 'org-fixture', name: 'Fixture Organization', clusters };
const user = {
	id: 'usr-fixture',
	email: 'fixture@example.test',
	firstName: 'Fixture',
	lastName: 'User',
	roles: {
		'org-fixture': {
			organizationId: 'org-fixture',
			organizationName: 'Fixture Organization',
			permission: { super_user: true },
		},
	},
};

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem('Studio:PotentiallyAuthenticated', JSON.stringify({ OverallAppSignIn: 'fixture' }));
	});
	await page.route('**/User/current', route => route.fulfill({ json: user }));
	await page.route('**/Organization/org-fixture', route => route.fulfill({ json: organization }));
	await page.route('**/Cluster/clu-production', route => route.fulfill({ json: { ...clusters[0], instances: [] } }));
	await page.route(
		'**/Region/**',
		route => route.fulfill({ json: [{ id: 'reg-east', region: 'US East' }, { id: 'reg-west', region: 'US West' }] }),
	);
	await page.route('**/SystemStatus/**', route => route.fulfill({ json: [] }));
	await page.routeWebSocket('**/*', socket => socket.close());
});

test('cluster overview filters the real route and retains card navigation', async ({ page }) => {
	await page.goto('/#/org-fixture');
	await expect(page.getByRole('heading', { name: 'Your infrastructure, at a glance' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Total clusters 2' })).toBeVisible();
	await page.getByLabel('Search clusters', { exact: true }).fill('Staging');
	await expect(page.getByRole('heading', { name: 'Production', exact: true })).toHaveCount(0);
	await page.getByLabel('Cluster region', { exact: true }).selectOption('US East');
	await expect(page.getByText('No matching clusters', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Reset filters' }).click();
	await page.getByRole('button', { name: 'Failures 1' }).click();
	await expect(page.getByRole('heading', { name: 'Staging', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Clear filters' }).click();
	await page.getByLabel('Sort clusters', { exact: true }).selectOption('name');
	await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('Production');
	await page.getByLabel('Search clusters', { exact: true }).fill('Production');
	await page.getByRole('button', { name: 'Cluster options' }).click();
	await expect(page.getByRole('menuitem', { name: 'Edit Version' })).toBeVisible();
	await page.keyboard.press('Escape');
	await page.getByRole('link', { name: 'Open Production' }).click();
	await expect(page).toHaveURL(/#\/org-fixture\/clu-production$/);
});

test('cluster overview fits a narrow screen and supports keyboard filtering', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/#/org-fixture');
	await expect(page.getByRole('button', { name: 'Total clusters 2' })).toBeVisible();
	await page.getByLabel('Search clusters', { exact: true }).focus();
	await page.keyboard.type('Production');
	await expect(page.getByRole('status')).toHaveText('Showing 1 of 2 clusters');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
