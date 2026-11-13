import { expect, type Page, test } from '@playwright/test';
import { rememberAppSignIn } from './signInMarkers';

const region = { id: 'us-1', region: 'US', latencyDescription: '83ms', instanceCount: 2 };
const plan = {
	id: 'free',
	deploymentType: 'colocated',
	deploymentDescription: 'Colocated',
	performanceDescription: 'Free',
	priceUsd: 0,
	allowedRegionIds: ['us-1'],
};
const instance = (id: string, extra: Record<string, unknown> = {}) => ({
	id,
	name: id,
	status: 'RUNNING',
	version: '5.3.1',
	...extra,
});
const baseCluster = {
	id: 'clu-fixture',
	name: 'Production',
	organizationId: 'org-fixture',
	status: 'RUNNING',
	abbreviatedName: 'production',
	plans: [{ planId: 'free', regionId: 'us-1' }],
	instances: [instance('ins-one'), instance('ins-two')],
};
type ClusterRecord = typeof baseCluster & { recordLocks?: boolean };

async function serve(page: Page, current: () => ClusterRecord, onPut?: (body: unknown) => void) {
	await page.route('**/Organization/org-fixture', route =>
		route.fulfill({
			json: { id: 'org-fixture', name: 'Fixture', subdomain: 'fixture', clusters: [current()] },
		}));
	await page.route('**/Cluster/clu-fixture', route => {
		if (route.request().method() === 'PUT') {
			onPut?.(route.request().postDataJSON());
			return route.fulfill({
				json: { id: 'clu-fixture', recordLocks: true, instancesUpdated: ['ins-one', 'ins-two'] },
			});
		}
		return route.fulfill({ json: current() });
	});
}

test.beforeEach(async ({ page }) => {
	await rememberAppSignIn(page);
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
	await page.route('**/Plan/**', route => route.fulfill({ json: [plan] }));
	await page.route('**/Region/**', route => route.fulfill({ json: [region] }));
	await page.route(
		'**/HarperVersions/**',
		route =>
			route.fulfill({
				json: { value: [{ name: 'stable', version: '5.3.1' }, { name: 'pinned', version: '5.2.13', scoped: true }] },
			}),
	);
	await page.route('**/SystemStatus/**', route => route.fulfill({ json: [] }));
	await page.routeWebSocket('**/*', socket => socket.close());
});

test('turning record locks on sends them alone and follows the roll to the end', async ({ page }, testInfo) => {
	let cluster: ClusterRecord = baseCluster;
	const bodies: unknown[] = [];
	await serve(page, () => cluster, body => {
		bodies.push(body);
		// A read right after the answer can predate the roll's UPDATING write.
		cluster = { ...baseCluster, recordLocks: true };
	});

	await page.goto('/#/org-fixture/clu-fixture/record-locks');
	await expect(page.getByRole('heading', { name: 'Record Locks', level: 1 })).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Cluster sections' }).getByRole('link', { name: 'Record Locks' }))
		.toBeVisible();
	await expect(page.getByText(/fails with a 503 error/)).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath('record-locks-off.png'), fullPage: true });

	await page.getByRole('switch', { name: 'Cluster-wide record locks' }).click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog).toContainText("restarts the cluster's 2 instances one at a time");
	await page.screenshot({ path: testInfo.outputPath('record-locks-confirm.png') });
	await dialog.getByRole('button', { name: 'Turn on' }).click();

	await expect.poll(() => bodies).toEqual([{ recordLocks: true }]);
	await expect(page.getByText('Turning record locks on')).toBeVisible();
	await expect(page.getByText(/didn't finish/)).toHaveCount(0);

	cluster = {
		...baseCluster,
		recordLocks: true,
		status: 'UPDATING',
		instances: [instance('ins-one', { recordLocks: true }), instance('ins-two', { status: 'PENDING_UPGRADE' })],
	};
	await expect(page.getByText('1 of 2 done.')).toBeVisible({ timeout: 15_000 });
	await page.screenshot({ path: testInfo.outputPath('record-locks-applying.png'), fullPage: true });

	cluster = {
		...baseCluster,
		recordLocks: true,
		instances: [instance('ins-one', { recordLocks: true }), instance('ins-two', { recordLocks: true })],
	};
	await expect(page.getByText('Turning record locks on')).toHaveCount(0, { timeout: 15_000 });
	await expect(page.getByRole('switch', { name: 'Cluster-wide record locks' })).toHaveAttribute('aria-checked', 'true');
	expect(bodies).toHaveLength(1);
});

test('a roll that stopped at a failed instance waits for it before trying again', async ({ page }, testInfo) => {
	await serve(page, () => ({
		...baseCluster,
		recordLocks: true,
		instances: [instance('ins-one', { recordLocks: true }), instance('ins-two', { status: 'FAILED' })],
	}));

	await page.goto('/#/org-fixture/clu-fixture/record-locks');

	await expect(page.getByText("Record locks didn't finish turning on")).toBeVisible();
	await expect(page.getByText(/ins-two has failed/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Try again' })).toBeDisabled();
	await page.screenshot({ path: testInfo.outputPath('record-locks-stopped.png'), fullPage: true });
});

test('a cluster below 5.3.0 is told to upgrade first', async ({ page }) => {
	await serve(page, () => ({ ...baseCluster, instances: [instance('ins-one', { version: '5.2.13' })] }));

	await page.goto('/#/org-fixture/clu-fixture/record-locks');

	await expect(page.getByRole('switch', { name: 'Cluster-wide record locks' })).toBeDisabled();
	await expect(page.getByText(/Record locks need Harper 5\.3\.0 or later, and 1 instance runs 5\.2\.13/)).toBeVisible();
	await page.getByRole('link', { name: 'Change the Harper version' }).click();
	await expect(page).toHaveURL(/#\/org-fixture\/clu-fixture\/edit\/version$/);
});

test('the version picker holds back versions below 5.3.0 while record locks are on', async ({ page }, testInfo) => {
	await serve(page, () => ({
		...baseCluster,
		recordLocks: true,
		instances: [instance('ins-one', { recordLocks: true }), instance('ins-two', { recordLocks: true })],
	}));

	await page.goto('/#/org-fixture/clu-fixture/edit/version');
	await expect(page.getByText(/turn them off on the Record Locks page first/)).toBeVisible();
	await page.getByRole('combobox').filter({ hasText: '5.3.1' }).click();

	await expect(page.getByRole('option', { name: /5\.2\.13/ })).toHaveAttribute('aria-disabled', 'true');
	await page.screenshot({ path: testInfo.outputPath('record-locks-version-picker.png') });
});

test('a new 5.3 cluster can opt in at creation', async ({ page }, testInfo) => {
	let payload: unknown;
	await serve(page, () => baseCluster);
	// No other cluster, so the free plan is still available to this organization.
	await page.route(
		'**/Organization/org-fixture',
		route => route.fulfill({ json: { id: 'org-fixture', name: 'Fixture', subdomain: 'fixture', clusters: [] } }),
	);
	await page.route('**/Cluster/', route => {
		payload = route.request().postDataJSON();
		return route.fulfill({ status: 409, json: { message: 'Fixture rejection' } });
	});

	await page.goto('/#/org-fixture/new-cluster');
	await page.getByLabel('Cluster Name', { exact: true }).fill('Locks Cluster');
	await page.getByRole('checkbox', { name: 'Cluster-wide record locks' }).check();
	await page.screenshot({ path: testInfo.outputPath('record-locks-create.png'), fullPage: true });
	await page.getByRole('button', { name: 'Create New Cluster' }).click();

	await expect.poll(() => payload).toEqual(expect.objectContaining({ version: '5.3.1', recordLocks: true }));
});
