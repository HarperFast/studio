import { expect, test } from '@playwright/test';

const region = { id: 'us-1', region: 'US', latencyDescription: '83ms', instanceCount: 2 };
const plan = {
	id: 'shared',
	deploymentType: 'colocated',
	deploymentDescription: 'Colocated',
	performanceDescription: 'Medium',
	priceUsd: 250,
	allowedRegionIds: ['us-1'],
	planLimits: { expirationMonths: 3, totalReadCount: 100000000, readsPerMinuteCount: 10000 },
};
const cluster = {
	id: 'clu-fixture',
	name: 'Production',
	organizationId: 'org-fixture',
	status: 'RUNNING',
	abbreviatedName: 'production',
	fqdn: 'production.fixture.example.test',
	plans: [{ planId: 'shared', regionId: 'us-1' }],
	instances: [{ id: 'ins-one', status: 'RUNNING', version: '5.2.13' }, {
		id: 'ins-two',
		status: 'RUNNING',
		version: '5.2.12',
	}],
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
	await page.route('**/User/current', route =>
		route.fulfill({
			json: {
				id: 'usr-fixture',
				firstname: 'Taylor',
				lastname: 'River',
				roles: {
					'org-fixture': {
						organizationId: 'org-fixture',
						organizationName: 'Fixture',
						permission: { super_user: true },
					},
				},
			},
		}));
	await page.route('**/Organization/org-fixture', route =>
		route.fulfill({
			json: {
				id: 'org-fixture',
				name: 'Fixture',
				subdomain: 'fixture',
				clusters: [cluster],
				billing: { paymentMethod: { status: 'pass', brand: 'visa', last4: '4242' } },
			},
		}));
	await page.route('**/Cluster/clu-fixture', route => route.fulfill({ json: cluster }));
	await page.route(
		'**/Plan/**',
		route =>
			route.fulfill({
				json: [plan, {
					...plan,
					id: 'self-hosted',
					deploymentType: 'self-hosted',
					deploymentDescription: 'Self-Hosted',
					priceUsd: 0,
				}],
			}),
	);
	await page.route('**/Region/**', route => route.fulfill({ json: [region] }));
	await page.route(
		'**/HarperVersions/**',
		route => route.fulfill({ json: { value: [{ name: 'stable', version: '5.2.13' }] } }),
	);
	await page.route('**/SystemStatus/**', route => route.fulfill({ json: [] }));
	await page.routeWebSocket('**/*', socket => socket.close());
});

test('paid creation preserves its values through billing and submits once', async ({ page }) => {
	const payloads: unknown[] = [];
	await page.route('**/Cluster/', route => {
		payloads.push(route.request().postDataJSON());
		return route.fulfill({ status: 409, json: { message: 'Fixture rejection' } });
	});
	await page.goto('/#/org-fixture/new-cluster');
	await page.getByLabel('Cluster Name', { exact: true }).fill('Preview Cluster');
	await expect(page.locator('p').filter({ hasText: 'Billed as' })).toContainText('$250.00');
	await page.getByLabel('Cluster Name', { exact: true }).press('Enter');
	await expect(page.getByRole('heading', { name: 'Cluster Billing', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Back to Details' }).click();
	await expect(page.getByLabel('Cluster Name', { exact: true })).toHaveValue('Preview Cluster');
	await page.getByRole('button', { name: 'Confirm Payment Details' }).click();
	await page.setViewportSize({ width: 390, height: 844 });
	const summary = page.getByRole('complementary', { name: 'Price summary' });
	const submit = page.getByRole('button', { name: 'Create New Cluster' });
	await expect(summary).toContainText('$250.00');
	await expect(submit).toBeVisible();
	const summaryBox = await summary.boundingBox();
	const submitBox = await submit.boundingBox();
	expect(summaryBox!.y + summaryBox!.height).toBeLessThan(submitBox!.y);
	await page.getByRole('button', { name: 'Create New Cluster' }).click();
	await expect.poll(() => payloads).toEqual([{
		abbreviatedName: 'preview-cluster',
		autoRenew: true,
		name: 'Preview Cluster',
		version: '5.2.13',
		organizationId: 'org-fixture',
		regionPlans: [{ autoRenew: true, planId: 'shared', regionId: 'us-1' }],
	}]);
	await expect(page.getByRole('button', { name: 'Create New Cluster' })).toBeEnabled();
	expect(payloads).toHaveLength(1);
});

test('partial version upgrade can resubmit without changing fields', async ({ page }) => {
	let payload: unknown;
	await page.route('**/Cluster/clu-fixture', route => {
		if (route.request().method() === 'GET') { return route.fulfill({ json: cluster }); }
		payload = route.request().postDataJSON();
		return route.fulfill({ status: 409, json: { message: 'Fixture rejection' } });
	});
	await page.goto('/#/org-fixture/clu-fixture/edit/version');
	await expect(page.getByText('1 of 2 instances', { exact: false })).toBeVisible();
	await expect(page.getByLabel('Cluster Name', { exact: true })).toBeDisabled();
	await page.getByRole('button', { name: 'Edit Cluster', exact: true }).click();
	await expect.poll(() => payload).toEqual({ version: '5.2.13' });
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`create and edit fit desktop and mobile in ${colorScheme}`, async ({ page }, testInfo) => {
		await page.emulateMedia({ colorScheme });
		for (const route of ['new-cluster', 'clu-fixture/edit']) {
			await page.goto(`/#/org-fixture/${route}`);
			await expect(page.getByLabel('Cluster Name', { exact: true })).toBeVisible();
			if (route === 'new-cluster') { await page.getByLabel('Cluster Name', { exact: true }).fill('Preview Cluster'); }
			else { await expect(page.getByLabel('Cluster Name', { exact: true })).toBeDisabled(); }
			for (const width of [1440, 1024, 390]) {
				await page.setViewportSize({ width, height: 1000 });
				expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
				await page.screenshot({
					path: testInfo.outputPath(`${route.replaceAll('/', '-')}-${colorScheme}-${width}.png`),
					fullPage: true,
				});
			}
		}
	});
}

test('self-hosted creation keeps instance connection settings and skips billing', async ({ page }) => {
	let payload: unknown;
	await page.route('**/Cluster/', route => {
		payload = route.request().postDataJSON();
		return route.fulfill({ status: 409, json: { message: 'Fixture rejection' } });
	});
	await page.goto('/#/org-fixture/new-cluster');
	await page.getByLabel('Cluster Name', { exact: true }).fill('Self Hosted');
	await page.getByRole('combobox').filter({ hasText: 'Colocated' }).click();
	await page.getByRole('option', { name: /Self-Hosted/ }).click();
	await expect(page.getByTestId('cluster-hostname-preview')).toHaveCount(0);
	await page.getByLabel('Optional Cluster Load Balancer Host Name').fill('cluster.example.test');
	await page.getByLabel('Host Name', { exact: true }).fill('node.example.test');
	await page.getByLabel('Operations API Port').fill('9925');
	await page.getByRole('button', { name: 'Create New Cluster' }).click();
	await expect.poll(() => payload).toEqual({
		autoRenew: true,
		fqdn: 'cluster.example.test',
		name: 'Self Hosted',
		version: '5.2.13',
		organizationId: 'org-fixture',
		regionPlans: [{
			autoRenew: true,
			instanceFqdn: 'node.example.test',
			operationsApiPort: 9925,
			operationsApiSecure: true,
			planId: 'self-hosted',
		}],
	});
});

test('hosted editing retains its restricted identity and submits only capacity changes', async ({ page }) => {
	const payloads: unknown[] = [];
	await page.route(
		'**/Plan/**',
		route => route.fulfill({ json: [plan, { ...plan, id: 'large', performanceDescription: 'Large', priceUsd: 500 }] }),
	);
	await page.route('**/Cluster/clu-fixture', route => {
		if (route.request().method() === 'GET') { return route.fulfill({ json: cluster }); }
		payloads.push(route.request().postDataJSON());
		return route.fulfill({ status: 409, json: { message: 'Fixture rejection' } });
	});
	await page.goto('/#/org-fixture/clu-fixture/edit');
	await expect(page.getByLabel('Host Name', { exact: true })).toBeDisabled();
	await page.getByRole('combobox').filter({ hasText: 'Medium' }).click();
	await page.getByRole('option', { name: /Large/ }).click();
	await page.getByRole('button', { name: 'Confirm Payment Details' }).click();
	await expect(page.getByRole('complementary', { name: 'Price summary' })).toContainText('$500.00');
	await page.getByRole('button', { name: 'Edit Cluster', exact: true }).click();
	await expect.poll(() => payloads).toEqual([{
		regionPlans: [{ autoRenew: true, planId: 'large', regionId: 'us-1' }],
	}]);
});

test('enterprise payment review retains contracted-rate guidance and hides public pricing', async ({ page }) => {
	await page.route('**/Organization/org-fixture', route =>
		route.fulfill({
			json: {
				id: 'org-fixture',
				name: 'Fixture',
				subdomain: 'fixture',
				type: 'ENTERPRISE',
				clusters: [cluster],
			},
		}));
	await page.goto('/#/org-fixture/new-cluster');
	await page.getByLabel('Cluster Name', { exact: true }).fill('Enterprise');
	await expect(page.getByRole('complementary', { name: 'Price summary' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Confirm Payment Details' }).click();
	await expect(page.getByText('Reminder: you will be billed at your contracted rate', { exact: false })).toBeVisible();
	await expect(page.getByRole('complementary', { name: 'Price summary' })).toHaveCount(0);
});
