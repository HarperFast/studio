import { expect, test } from '@playwright/test';

const member = (organizationName: string, role = 'owner') => ({
	organizationName,
	role,
	permission: { super_user: true },
});
const user = {
	id: 'org-user',
	email: 'org@example.test',
	roles: {
		'org-a': member('Acme'),
		'org-b': member('Beta', 'developer'),
		'org-locked': {
			organizationName: 'Locked Team',
			oauthProviders: [{ name: 'Example', oauthConfigId: 'provider-test' }],
		},
	},
};

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
	await page.route('**/Organization/*', route => route.fulfill({ json: { id: 'org-a', name: 'Acme', clusters: [] } }));
	await page.route('**/Region/**', route => route.fulfill({ json: [] }));
	await page.route('**/SystemStatus/**', route => route.fulfill({ json: [] }));
	await page.routeWebSocket('**/*', socket => socket.close());
});

test('filters both access states, sorts names and preserves provider actions', async ({ page }) => {
	await page.goto('/#/');
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Acme', 'Beta', 'Locked Team']);
	await expect(page.getByRole('link', { name: 'Open Locked Team' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Sign in with Example' })).toHaveAttribute('href', /provider-test/);
	await page.getByRole('textbox', { name: 'Search organizations' }).fill('locked');
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Locked Team']);
	await page.getByRole('textbox', { name: 'Search organizations' }).fill('missing');
	await expect(page.getByRole('heading', { name: 'No matching organizations' })).toBeVisible();
	await page.getByRole('button', { name: 'Clear filters' }).click();
	await page.getByRole('combobox', { name: 'Sort organizations' }).selectOption('desc');
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Locked Team', 'Beta', 'Acme']);
	await page.getByRole('combobox', { name: 'Organization role' }).selectOption('developer');
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Beta']);
	await page.getByRole('combobox', { name: 'Organization access' }).selectOption('locked');
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Locked Team']);
	await expect(page.getByRole('combobox', { name: 'Organization role' })).toHaveCount(0);
});

test('keeps an empty access filter out of onboarding and fits a narrow screen', async ({ page }) => {
	await page.route(
		'**/User/current',
		route => route.fulfill({ json: { ...user, roles: { 'org-a': member('Acme') } } }),
	);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/#/');
	await expect(page.getByRole('group', { name: 'Organization summary' })).toBeHidden();
	await page.getByRole('combobox', { name: 'Organization access' }).selectOption('locked');
	await expect(page.getByRole('heading', { name: 'No matching organizations' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Your teams, connected.' })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('copy and options do not navigate and card hover keeps its geometry', async ({ page }) => {
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto('/#/');
	const link = page.getByRole('link', { name: 'Open Acme', exact: true });
	const before = await link.boundingBox();
	await link.hover({ position: { x: 2, y: before!.height / 2 } });
	expect(await link.boundingBox()).toEqual(before);
	expect(await link.evaluate(element => getComputedStyle(element).cursor)).toBe('pointer');
	await page.getByRole('button', { name: 'Copy ID for Acme' }).click();
	await expect(page).toHaveURL(/#\/$/);
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('org-a');
	await page.getByRole('button', { name: 'Options', exact: true }).first().click();
	await expect(page.getByRole('menuitem', { name: 'Delete', exact: true })).toBeVisible();
});

test('staff directory preserves server pagination, pasted IDs and error retry', async ({ page }) => {
	await page.route(
		'**/User/current',
		route => route.fulfill({ json: { ...user, fabricRole: 'user', staffPermissions: ['org:read'] } }),
	);
	let fail = false;
	await page.route('**/Admin/Organization/**', route => {
		if (route.request().url().includes('/org-found')) {
			return route.fulfill({ json: { id: 'org-found', name: 'Found organization' } });
		}
		if (fail) { return route.fulfill({ status: 500, json: { message: 'Unavailable' } }); }
		return route.fulfill({
			json: Array.from({ length: 13 }, (_, index) => ({ id: `org-${index}`, name: `Staff ${index}` })),
		});
	});
	await page.route(
		'**/Cluster/clu-lookup',
		route => route.fulfill({ json: { id: 'clu-lookup', organizationId: 'org-found' } }),
	);
	await page.goto('/#/');
	await page.getByRole('switch', { name: 'Show all organizations' }).click();
	await expect(page.getByRole('heading', { level: 2 })).toHaveCount(12);
	await expect(page.getByRole('group', { name: 'Organization summary' })).toHaveCount(0);
	await expect(page.getByRole('combobox', { name: 'Sort organizations' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
	fail = true;
	await page.getByRole('switch', { name: 'Show all organizations' }).click();
	await page.getByRole('switch', { name: 'Show all organizations' }).click();
	await expect(page.getByRole('alert')).toContainText('Showing the last available results');
	await expect(page.getByRole('heading', { level: 2 })).toHaveCount(12);
	fail = false;
	await page.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveCount(0);
	fail = true;
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('Organizations couldn’t be loaded');
	fail = false;
	await page.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveCount(0);
	await page.getByRole('textbox', { name: 'Search organizations' }).fill('clu-lookup');
	await expect(page.getByRole('link', { name: 'Open Found organization' })).toBeVisible();
});

test('normalizes missing membership names before filtering and preserves creation redirect', async ({ page }) => {
	await page.route('**/User/current', route =>
		route.fulfill({
			json: {
				...user,
				roles: { 'org-a': { role: 'owner', permission: { super_user: true } }, 'org-locked': user.roles['org-locked'] },
			},
		}));
	await page.goto('/#/');
	await expect(page.getByRole('link', { name: 'Open org-a', exact: true })).toBeVisible();
	await page.getByRole('textbox', { name: 'Search organizations' }).fill('org-a');
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(['org-a']);
	await page.getByRole('textbox', { name: 'Search organizations' }).fill('');
	await page.goto('/#/?createCluster=true');
	await expect(page).toHaveURL(/#\/org-a\/new-cluster/);
});
