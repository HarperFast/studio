import { expect, test } from '@playwright/test';

const clusters = [
	{ id: 'clu-production', name: 'Production', status: 'RUNNING', regionId: 'reg-east' },
	{ id: 'clu-staging', name: 'Staging', status: 'FAILED', regionId: 'reg-west' },
].map(({ regionId, ...cluster }) => ({
	...cluster,
	organizationId: 'org-fixture',
	fqdn: `${cluster.id}.example.test`,
	plans: [{ planId: 'shared', regionId }],
}));

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
	await expect(page.locator('[data-slot=card-title]').getByRole('heading', { level: 2 }).first()).toHaveText(
		'Production',
	);
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
	await expect(page.getByRole('group', { name: 'Cluster summary' })).toBeHidden();
	await expect(page.getByLabel('Cluster status', { exact: true })).toBeVisible();
	await page.getByLabel('Search clusters', { exact: true }).focus();
	await page.keyboard.type('Production');
	await expect(page.getByRole('status')).toHaveText('Showing 1 of 2 clusters');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('clickable cards keep a pointer across their border and Open affordance', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1100 });
	await page.goto('/#/org-fixture');
	const link = page.getByRole('link', { name: 'Open Production' });
	const card = link.locator('..');
	const bounds = await card.boundingBox();
	expect(bounds).not.toBeNull();
	await page.mouse.move(bounds!.x + 0.25, bounds!.y + bounds!.height / 2);
	await expect(card).toHaveCSS('cursor', 'pointer');
	const open = card.getByText('Open', { exact: true });
	const action = await open.boundingBox();
	expect(action).not.toBeNull();
	for (const fraction of [0.1, 0.3, 0.5, 0.7, 0.9]) {
		const x = action!.x + action!.width * fraction;
		const y = action!.y + action!.height / 2;
		await page.mouse.move(x, y);
		const hit = await page.evaluate(({ x, y }) => {
			const target = document.elementFromPoint(x, y);
			return { cursor: target && getComputedStyle(target).cursor, label: target?.closest('a')?.ariaLabel };
		}, { x, y });
		expect(hit).toEqual({ cursor: 'pointer', label: 'Open Production' });
	}
	await expect(page).toHaveURL(/#\/org-fixture$/);
	await page.mouse.click(action!.x + action!.width / 2, action!.y + action!.height / 2);
	await expect(page).toHaveURL(/#\/org-fixture\/clu-production$/);
});

test('updated clusters stay out of Running until they can be opened', async ({ page }) => {
	await page.route('**/Organization/org-fixture', route =>
		route.fulfill({
			json: { ...organization, clusters: [{ ...clusters[0], status: 'UPDATED' }] },
		}));
	await page.goto('/#/org-fixture');
	await expect(page.getByRole('button', { name: 'Running 0', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Needs attention 1', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Open Production' })).toHaveCount(0);
	await page.getByLabel('Cluster status', { exact: true }).selectOption('running');
	await expect(page.getByText('No matching clusters', { exact: true })).toBeVisible();
});

test('finds live instance regions when only some plan regions resolve', async ({ page }) => {
	await page.route('**/Organization/org-fixture', route =>
		route.fulfill({
			json: {
				...organization,
				clusters: [{
					...clusters[0],
					plans: [{ planId: 'shared', regionId: 'reg-east' }, { planId: 'shared', regionId: 'missing' }],
					instances: [
						{ id: 'east', status: 'RUNNING', region: 'US East' },
						{ id: 'west', status: 'RUNNING', region: 'US West' },
					],
				}],
			},
		}));
	await page.goto('/#/org-fixture');
	await page.getByLabel('Cluster region', { exact: true }).selectOption('US West');
	await expect(page.getByRole('heading', { name: 'Production', exact: true })).toBeVisible();
	await expect(page.getByRole('status')).toHaveText('Showing 1 of 1 clusters');
	await expect(page.getByRole('link', { name: 'Open Production' })).toBeVisible();
});
