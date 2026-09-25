import { expect, test } from '@playwright/test';

const role = (organizationName: string) => ({ organizationName, role: 'owner', permission: { super_user: true } });
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
	await page.route(
		'**/User/current',
		route =>
			route.fulfill({
				json: {
					id: 'search-user',
					email: 'search@example.test',
					roles: { a: role('Alpha'), b: role('Beta'), locked: { ...role('Locked'), oauthProviders: [] } },
				},
			}),
	);
	await page.route('**/Organization/*', route => {
		const id = route.request().url().split('/').at(-1)!;
		return route.fulfill({
			json: {
				id,
				name: id === 'a' ? 'Alpha' : 'Beta',
				clusters: [{
					id: `cluster-${id}`,
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
				json: {
					id: route.request().url().split('/').at(-1),
					name: 'Production',
					organizationId: 'b',
					status: 'RUNNING',
					instances: [],
				},
			}),
	);
	await page.route('**/Region/**', route => route.fulfill({ json: [] }));
	await page.route('**/SystemStatus/**', route => route.fulfill({ json: [] }));
	await page.routeWebSocket('**/*', socket => socket.close());
});

test('finds unvisited clusters, reuses snapshots, and navigates with the keyboard', async ({ page }) => {
	const requests: string[] = [];
	page.on('request', request => {
		if (request.url().includes('/Organization/')) { requests.push(request.url()); }
	});
	await page.goto('/#/a');
	expect(requests.filter(url => url.endsWith('/b'))).toHaveLength(0);
	await page.keyboard.press('Control+k');
	await expect(page.getByRole('dialog')).toHaveCount(1);
	const input = page.getByRole('combobox', { name: 'Search organizations and clusters' });
	await input.fill('production');
	await expect(page.getByRole('option')).toHaveCount(2);
	await expect(page.getByRole('option').nth(1)).toContainText('Beta');
	await expect(page.getByRole('option', { name: /Locked/ })).toHaveCount(0);
	await input.press('Escape');
	await page.getByRole('button', { name: 'Search organizations and clusters' }).click();
	await input.fill('production beta');
	await expect(page.getByRole('option')).toHaveCount(1);
	expect(requests.filter(url => url.endsWith('/b'))).toHaveLength(1);
	await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
	await expect(page.getByRole('dialog')).toBeVisible();
	await input.press('Enter');
	await expect(page).toHaveURL(/#\/b\/cluster-b(?:\/instances)?$/);
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('keeps partial results usable and retries a failed organization without duplicate error toasts', async ({ page }) => {
	let fail = true;
	await page.route('**/Organization/b', route =>
		fail
			? route.fulfill({ status: 500, json: { message: 'Unavailable' } })
			: route.fulfill({
				json: { id: 'b', name: 'Beta', clusters: [{ id: 'cluster-b', name: 'Recovered', status: 'RUNNING' }] },
			}));
	await page.goto('/#/a');
	await page.getByRole('button', { name: 'Search organizations and clusters' }).click();
	await expect(page.getByText('Some organizations could not be loaded.', { exact: false })).toBeVisible();
	await expect(page.locator('[data-sonner-toast][data-type=error]')).toHaveCount(0);
	await expect(page.getByRole('option', { name: /Alpha/ }).first()).toBeVisible();
	fail = false;
	await page.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(page.getByRole('option', { name: /Recovered/ })).toBeVisible();
});

test('preserves editable shortcuts and restores trigger focus on a narrow screen', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/#/a');
	await page.getByRole('textbox', { name: 'Search clusters', exact: true }).focus();
	await page.keyboard.press('Control+k');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	const trigger = page.getByRole('button', { name: 'Search organizations and clusters' });
	await trigger.click();
	await expect(page.getByRole('combobox', { name: 'Search organizations and clusters' })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(trigger).toBeFocused();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('retains a chosen result when a higher-ranked match arrives later', async ({ page }) => {
	let release!: () => void;
	const pending = new Promise<void>(resolve => {
		release = resolve;
	});
	await page.route('**/Organization/b', async route => {
		await pending;
		return route.fulfill({
			json: { id: 'b', name: 'Beta', clusters: [{ id: 'cluster-b', name: 'Prod', status: 'RUNNING' }] },
		});
	});
	await page.goto('/#/a');
	await page.getByRole('button', { name: 'Search organizations and clusters' }).click();
	const input = page.getByRole('combobox', { name: 'Search organizations and clusters' });
	await input.fill('prod');
	await expect(page.getByRole('option')).toHaveCount(1);
	await input.press('ArrowDown');
	release();
	await expect(page.getByRole('option')).toHaveCount(2);
	await expect(page.getByRole('option').first()).toContainText('Beta');
	await expect(page.getByRole('option', { selected: true })).toContainText('Alpha');
});

test('clears a chosen result displaced beyond the visible limit before Enter can navigate', async ({ page }) => {
	let release!: () => void;
	const pending = new Promise<void>(resolve => {
		release = resolve;
	});
	await page.route('**/Organization/b', async route => {
		await pending;
		return route.fulfill({
			json: {
				id: 'b',
				name: 'Beta',
				clusters: Array.from({ length: 40 }, (_, index) => ({
					id: `prod-${index}`,
					name: 'Prod',
					status: 'RUNNING',
				})),
			},
		});
	});
	await page.goto('/#/a');
	await page.getByRole('button', { name: 'Search organizations and clusters' }).click();
	const input = page.getByRole('combobox', { name: 'Search organizations and clusters' });
	await input.fill('prod');
	await expect(page.getByRole('option')).toHaveCount(1);
	await input.press('ArrowDown');
	await expect(page.getByRole('option', { selected: true })).toContainText('Alpha');
	release();
	await expect(page.getByRole('option')).toHaveCount(40);
	await expect(page.getByRole('option', { selected: true })).toHaveCount(0);
	await expect(input).not.toHaveAttribute('aria-activedescendant');
	await input.press('Enter');
	await expect(page.getByRole('dialog')).toBeVisible();
	await expect(page).toHaveURL(/#\/a$/);
	await input.press('ArrowUp');
	await expect(page.getByRole('option').last()).toHaveAttribute('aria-selected', 'true');
	await input.press('ArrowDown');
	await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
	await input.press('Enter');
	await expect(page).toHaveURL(/#\/b\/prod-0(?:\/instances)?$/);
});

test('keeps the dashboard usable when the search bundle cannot load', async ({ page }) => {
	await page.addInitScript(() => sessionStorage.setItem('Studio:StaleDeployReloadedAt', String(Date.now())));
	await page.route(
		/\/(?:assets\/SearchDialog-[^/]+\.js|src\/features\/search\/SearchDialog\.tsx)(?:\?.*)?$/,
		route => route.abort(),
	);
	await page.goto('/#/a');
	const trigger = page.getByRole('button', { name: 'Search organizations and clusters' });
	await trigger.click();
	await expect(page.getByRole('alert')).toContainText('Search couldn’t load');
	await expect(page.getByRole('heading', { name: 'Clusters', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(trigger).toBeFocused();
});
