import { expect, type Page, test } from '@playwright/test';
import { rememberAppSignIn } from './signInMarkers';

const staff = {
	id: 'usr-staff',
	email: 'staff@harperdb.io',
	firstname: 'Sky',
	lastname: 'Admin',
	roles: {},
	fabricRole: 'fabric_admin',
	staffPermissions: ['user:read', 'user:status', 'cluster:read', 'org:read'],
};

const pat = {
	id: 'usr-0f8gtsvjqed6xwy9',
	email: 'pat.target@example.test',
	firstname: 'Pat',
	lastname: 'Target',
	status: 'ACTIVE',
	isVerified: true,
	createdAt: '2026-03-14T16:20:00.000Z',
	lastLoginDate: '2026-10-24T09:12:00.000Z',
	lastAccessedAt: '2026-10-26T18:41:00.000Z',
	organizations: [
		{
			organizationId: 'org-shared',
			organizationName: 'Shared Co',
			roleNames: ['admin'],
			lastAdmin: false,
			clusters: [
				{ id: 'clu-cm', name: 'Central Manager', status: 'RUNNING' },
				{ id: 'clu-hm1', name: 'Host Manager 1', status: 'RUNNING' },
				{ id: 'clu-hm2', name: 'Host Manager 2', status: 'STOPPED' },
				{ id: 'clu-hm3', name: 'Host Manager 3', status: 'FAILED' },
				{ id: 'clu-hm4', name: 'Host Manager 4', status: 'UPDATING' },
			],
		},
		{ organizationId: 'org-solo', organizationName: 'Solo Co', roleNames: ['admin'], lastAdmin: true, clusters: [] },
		{
			organizationId: 'org-stale',
			organizationName: 'Stale Co',
			roleNames: ['admin', 'developer'],
			lastAdmin: true,
			clusters: [{ id: 'clu-stale', name: 'Legacy API', status: 'RUNNING' }],
		},
		{
			organizationId: 'org-member',
			organizationName: 'Member Co',
			roleNames: ['developer'],
			lastAdmin: false,
			clusters: [],
		},
	],
};

async function mockCentralManager(page: Page) {
	await rememberAppSignIn(page);
	await page.route(
		'**/*',
		(route) =>
			['fetch', 'xhr'].includes(route.request().resourceType())
				? route.fulfill({ status: 404, json: {} })
				: route.continue(),
	);
	await page.route('**/User/current', (route) => route.fulfill({ json: staff }));
	await page.route(
		/\/Admin\/User\/\?email=/,
		(route) => route.fulfill({ json: [{ id: pat.id, email: pat.email, status: pat.status }] }),
	);
	await page.route(`**/Admin/User/${pat.id}?details=true`, (route) => route.fulfill({ json: pat }));
	await page.routeWebSocket('**/*', (socket) => socket.close());
}

for (const colorScheme of ['light', 'dark'] as const) {
	test(`user lookup and details read well on desktop and mobile in ${colorScheme} mode`, async ({ page }, testInfo) => {
		await mockCentralManager(page);
		await page.emulateMedia({ colorScheme });
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto('/#/admin/users');
		await expect(page.getByLabel('Email or user ID')).toBeVisible();
		await page.screenshot({ path: testInfo.outputPath(`users-search-${colorScheme}.png`), fullPage: true });

		await page.getByLabel('Email or user ID').fill('Pat.Target@example.test');
		await page.getByRole('button', { name: 'Look up' }).click();
		await expect(page).toHaveURL(new RegExp(`#/admin/users/${pat.id}$`));
		await expect(page.getByText('Pat Target').first()).toBeVisible();
		await page.screenshot({ path: testInfo.outputPath(`users-details-${colorScheme}.png`), fullPage: true });

		await page.setViewportSize({ width: 390, height: 844 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		await page.screenshot({ path: testInfo.outputPath(`users-details-${colorScheme}-mobile.png`), fullPage: true });
	});
}

test('deactivating confirms the split, then shows what the server did', async ({ page }, testInfo) => {
	await mockCentralManager(page);
	let patched: unknown;
	await page.route(`**/Admin/User/${pat.id}`, async (route) => {
		if (route.request().method() !== 'PATCH') { return route.fallback(); }
		patched = route.request().postDataJSON();
		await route.fulfill({
			json: {
				id: pat.id,
				status: 'DEACTIVATED',
				removedFrom: [pat.organizations[0], pat.organizations[3]],
				retainedIn: [pat.organizations[1], pat.organizations[2]],
			},
		});
	});
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto(`/#/admin/users/${pat.id}`);

	await page.getByRole('button', { name: 'Deactivate' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByText('Will stay in, as the last admin')).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath('users-confirm.png') });

	await dialog.getByRole('button', { name: 'Deactivate' }).click();
	await expect(dialog.getByText('User deactivated')).toBeVisible();
	expect(patched).toEqual({ status: 'DEACTIVATED' });
	await page.screenshot({ path: testInfo.outputPath('users-result.png') });
});
