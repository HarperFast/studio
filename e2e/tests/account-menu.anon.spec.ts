import { expect, test } from '@playwright/test';

const role = (name: string) => ({ organizationName: name, role: 'owner', permission: { super_user: true } });
const user = {
	id: 'usr-menu',
	firstname: 'Alex',
	lastname: 'User',
	email: 'alex@example.test',
	roles: {
		'org-a': role('Alpha'),
		'org-b': role('Beta'),
		'org-locked': { ...role('Locked'), oauthProviders: [{ name: 'SSO', oauthConfigId: 'oauth-test' }] },
	},
};

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() =>
		localStorage.setItem('Studio:PotentiallyAuthenticated', JSON.stringify({ OverallAppSignIn: 'fixture' }))
	);
	await page.route('**/User/current', route => route.fulfill({ json: user }));
	await page.route('**/Organization/*', route => {
		const id = route.request().url().split('/').at(-1)!;
		return route.fulfill({
			json: {
				id,
				name: id === 'org-a' ? 'Alpha' : 'Beta',
				clusters: [{
					id: `clu-${id}`,
					name: 'Production',
					organizationId: id,
					status: 'RUNNING',
					fqdn: 'example.test',
				}],
			},
		});
	});
	await page.route(
		'**/Cluster/*',
		route =>
			route.fulfill({
				json: { id: 'clu-org-a', name: 'Production', organizationId: 'org-a', status: 'RUNNING', instances: [] },
			}),
	);
	await page.route('**/Region/**', route => route.fulfill({ json: [] }));
	await page.route('**/SystemStatus/**', route => route.fulfill({ json: [] }));
	await page.routeWebSocket('**/*', socket => socket.close());
});

test('sidebar switches to the organization root from a cluster, and excludes locked memberships', async ({ page }) => {
	await page.goto('/#/org-a/clu-org-a');
	await page.getByRole('button', { name: 'Switch organization, current: Alpha' }).click();
	await expect(page.getByRole('menuitem', { name: 'Locked', exact: true })).toHaveCount(0);
	await page.getByRole('menuitem', { name: 'Beta', exact: true }).click();
	await expect(page).toHaveURL(/#\/org-b$/);
	await expect(page.getByRole('button', { name: 'Switch organization, current: Beta' })).toBeVisible();
});

test('account menu groups profile, organization switching, appearance and sign out', async ({ page }) => {
	await page.goto('/#/org-a');
	await page.getByRole('button', { name: 'Account menu' }).click();
	await expect(page.getByRole('menuitem', { name: 'Profile', exact: true })).toHaveAttribute('href', '/#/profile');
	await page.getByRole('menuitem', { name: 'Switch organization', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Beta', exact: true }).click();
	await expect(page).toHaveURL(/#\/org-b$/);
	await page.getByRole('button', { name: 'Account menu' }).click();
	await page.getByRole('menuitem', { name: 'Appearance', exact: true }).click();
	await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click();
	await expect(page.locator('html')).toHaveClass(/dark/);
	await page.reload();
	await expect(page.locator('html')).toHaveClass(/dark/);
	await page.getByRole('button', { name: 'Account menu' }).click();
	await page.getByRole('menuitem', { name: 'Appearance', exact: true }).click();
	await page.getByRole('menuitemradio', { name: 'Light', exact: true }).click();
	await expect(page.locator('html')).not.toHaveClass(/dark/);
	let signedOut = false;
	await page.route(/\/Logout\/?$/, route => {
		expect(route.request().method()).toBe('POST');
		signedOut = true;
		return route.fulfill({ json: {} });
	});
	await page.route('**/User/current', route =>
		signedOut
			? route.fulfill({ status: 401, json: { error: 'Signed out' } })
			: route.fulfill({ json: user }));
	await page.getByRole('button', { name: 'Account menu' }).click();
	await page.getByRole('menuitem', { name: 'Sign Out', exact: true }).click();
	await expect(page).toHaveURL(/#\/sign-in/);
	expect(signedOut).toBe(true);
	await expect(page.getByText('You have been signed out successfully.')).toBeVisible();
});

test('account controls remain reachable on a narrow screen with keyboard focus return', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/#/org-a');
	const trigger = page.getByRole('button', { name: 'Account menu' });
	await trigger.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('menuitem', { name: 'Sign Out', exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(trigger).toBeFocused();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('staff sees the cached name when visiting a non-membership organization', async ({ page }) => {
	await page.route('**/User/current', route =>
		route.fulfill({
			json: {
				...user,
				fabricRole: 'fabric_admin',
				staffPermissions: ['org:read', 'cluster:read'],
				roles: { 'org-b': role('Beta') },
			},
		}));
	await page.goto('/#/org-a');
	await expect(page.getByRole('button', { name: 'Switch organization, current: Alpha' })).toBeVisible();
	await page.getByRole('button', { name: 'Switch organization, current: Alpha' }).click();
	await page.getByRole('menuitem', { name: 'Beta', exact: true }).click();
	await expect(page).toHaveURL(/#\/org-b$/);
});
