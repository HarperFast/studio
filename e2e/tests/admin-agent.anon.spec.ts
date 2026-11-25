import { expect, type Page, test } from '@playwright/test';
import { rememberAppSignIn } from './signInMarkers';

const staff = {
	id: 'usr-staff',
	email: 'staff@harperdb.io',
	firstname: 'Sky',
	lastname: 'Admin',
	roles: {},
	fabricRole: 'fabric_admin',
	staffPermissions: ['agent:read', 'agent:run', 'cluster:read', 'config:read', 'config:write'],
};

const activeRun = {
	id: 'arn-live',
	clusterId: 'clu-live',
	organizationId: 'org-1',
	role: 'investigator',
	triggerKind: 'failed_operation',
	trigger: { kind: 'failed_operation', ref: 'op-1', windowMinutes: 60, operation: 'restart' },
	status: 'running',
	stage: 'gathering',
	verdict: null,
	confidence: null,
	createdAt: new Date(Date.now() - 20_000).toISOString(),
	startedAt: new Date(Date.now() - 19_000).toISOString(),
	modelCallAt: null,
	finishedAt: null,
	cost: { reservedUsd: 1, spentUsd: 0, spendKnown: false, tokens: null },
	error: null,
	blindSpots: [],
};

const pastRun = {
	...activeRun,
	id: 'arn-done',
	clusterId: 'clu-done',
	clusterName: 'checkout-prod',
	organizationName: 'Example Co',
	status: 'completed',
	stage: 'finished',
	verdict: 'degraded',
	confidence: 'medium',
	createdAt: '2026-11-16T09:00:00.000Z',
	startedAt: '2026-11-16T09:00:01.000Z',
	finishedAt: '2026-11-16T09:00:41.000Z',
	cost: { reservedUsd: 1, spentUsd: 0.27, spendKnown: true, tokens: null },
};

const pastDetail = {
	...pastRun,
	evidence: [
		{
			id: 'ev-1',
			name: 'get_status',
			status: 'ok',
			coverage: 'complete',
			bytes: 4096,
			durationMs: 210,
			text: 'status text',
		},
		{ id: 'ev-2', name: 'host_logs', status: 'blind_spot', coverage: 'none', reason: 'timed out', bytes: 0 },
	],
	blindSpots: ['host_logs: timed out'],
	brief: 'The brief the model saw.',
	finding: {
		triage: { verdict: 'degraded', summary: 'One member stopped serving after the restart.' },
		hypotheses: [{ cause: 'The member ran out of disk', confidence: 'medium', evidence: ['ev-1'], against: [] }],
		blindSpots: [],
		rejected: [],
		captureBeforeRestart: [],
		nextStep: 'Free disk on the member, then restart it.',
	},
	watches: [],
};

const overview = {
	month: '2026-11',
	agentEnabled: true,
	runBudgetUsd: 1,
	roles: [{
		role: 'investigator',
		enabled: true,
		monthlyBudgetUsd: 50,
		reservedUsd: 1,
		spentUsd: 2.5,
		runs: 9,
		updatedAt: null,
	}],
	settings: [
		{ name: 'AGENT_ENABLED', description: 'Global switch.', value: true, superUserOnly: false },
		{ name: 'AGENT_RUN_BUDGET_USD', description: 'Per-run cap.', value: 1, superUserOnly: false },
		{
			name: 'AGENT_MONTHLY_BUDGET_USD_INVESTIGATOR',
			description: 'USD the investigator role may reserve and spend per calendar month; past it a start is refused.',
			value: 20,
			superUserOnly: false,
		},
		{
			name: 'AGENT_TRIGGER_COOLDOWN_MINUTES',
			description: 'Minutes after an automatic investigation during which another failure starts no new run.',
			value: 60,
			superUserOnly: false,
		},
		{ name: 'AGENT_SLACK_ENABLED', description: 'Post findings to Slack.', value: false, superUserOnly: false },
		{
			name: 'AGENT_SLACK_CHANNEL',
			description: 'The channel the webhook posts to, so a reader knows where the digest lands.',
			value: '',
			superUserOnly: false,
		},
		{ name: 'GRAFANA_LOKI_URL', description: 'Loki base URL.', value: 'https://loki.example', superUserOnly: true },
	],
};

async function mockCentralManager(page: Page, state: { active: unknown[]; past: unknown[] }) {
	await rememberAppSignIn(page);
	await page.route(
		'**/*',
		(route) =>
			['fetch', 'xhr'].includes(route.request().resourceType())
				? route.fulfill({ status: 404, json: {} })
				: route.continue(),
	);
	await page.route('**/User/current', (route) => route.fulfill({ json: staff }));
	await page.route('**/Admin/AgentOverview/', (route) => route.fulfill({ json: overview }));
	await page.route(/\/Admin\/AgentWatch\/\?/, (route) => route.fulfill({ json: [] }));
	await page.route(
		/\/Admin\/Investigation\/\?/,
		(route) => {
			const url = route.request().url();
			if (url.includes('status=active')) { return route.fulfill({ json: state.active }); }
			if (url.includes('status=terminal')) { return route.fulfill({ json: state.past }); }
			return route.fulfill({ status: 400, json: { error: 'unexpected run list request' } });
		},
	);
	await page.route('**/Admin/Investigation/arn-done', (route) => route.fulfill({ json: pastDetail }));
	await page.routeWebSocket('**/*', (socket) => socket.close());
}

for (const colorScheme of ['light', 'dark'] as const) {
	test(
		`agent activity and run detail read well on desktop and mobile in ${colorScheme} mode`,
		async ({ page }, testInfo) => {
			await mockCentralManager(page, { active: [activeRun], past: [pastRun] });
			await page.emulateMedia({ colorScheme });
			await page.setViewportSize({ width: 1440, height: 1000 });
			await page.goto('/#/admin/agent');

			const active = page.getByRole('region', { name: 'Active runs' });
			await expect(active.getByText('arn-live')).toBeVisible();
			await expect(active.getByText('Gathering evidence')).toBeVisible();
			await expect(active.getByRole('button', { name: 'Cancel run arn-live' })).toBeVisible();
			const past = page.getByRole('region', { name: 'Past runs' });
			await expect(past.getByText('arn-done')).toBeVisible();
			await expect(past.getByText('arn-live')).toHaveCount(0);
			await expect(past.getByText('$0.27')).toBeVisible();
			await expect(past.getByText('checkout-prod')).toBeVisible();
			await page.screenshot({ path: testInfo.outputPath(`agent-activity-${colorScheme}.png`), fullPage: true });

			await past.getByRole('link', { name: 'arn-done' }).click();
			await expect(page).toHaveURL(/#\/admin\/agent\/arn-done$/);
			await expect(page.getByText('One member stopped serving after the restart.')).toBeVisible();
			await expect(page.getByRole('region', { name: 'Blind spots' }).getByText('host_logs: timed out')).toBeVisible();
			await expect(page.getByText('The brief the model saw.')).toHaveCount(0);
			await page.getByRole('button', { name: 'Show brief' }).click();
			await expect(page.getByText('The brief the model saw.')).toBeVisible();
			await page.screenshot({ path: testInfo.outputPath(`agent-run-${colorScheme}.png`), fullPage: true });

			await page.setViewportSize({ width: 390, height: 844 });
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			await page.screenshot({ path: testInfo.outputPath(`agent-run-${colorScheme}-mobile.png`), fullPage: true });
		},
	);
}

for (const width of [1440, 390]) {
	test(`agent settings fit the page at ${width}px`, async ({ page }, testInfo) => {
		await mockCentralManager(page, { active: [], past: [] });
		await page.setViewportSize({ width, height: 1000 });
		await page.goto('/#/admin/agent');
		await page.getByRole('tab', { name: 'Settings' }).click();
		const form = page.getByRole('form', { name: 'Agent settings' });
		await expect(form.getByText('AGENT_SLACK_CHANNEL')).toBeVisible();
		await page.screenshot({ path: testInfo.outputPath(`agent-settings-${width}.png`), fullPage: true });
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		const formBox = (await form.boundingBox())!;
		for (const input of await form.locator('input, textarea, button[role="combobox"]').all()) {
			const box = (await input.boundingBox())!;
			expect(box.x + box.width).toBeLessThanOrEqual(formBox.x + formBox.width + 1);
		}
	});
}

test('a run moves from Active to Past runs when it finishes, without a reload', async ({ page }) => {
	// Past runs starts without the open run, so only the refetch Active triggers can bring it there inside 30 s.
	const state = { active: [activeRun] as unknown[], past: [pastRun] as unknown[] };
	await mockCentralManager(page, state);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto('/#/admin/agent');
	const active = page.getByRole('region', { name: 'Active runs' });
	const past = page.getByRole('region', { name: 'Past runs' });
	await expect(active.getByText('arn-live')).toBeVisible();

	const finished = {
		...activeRun,
		status: 'completed',
		stage: 'finished',
		verdict: 'healthy',
		finishedAt: new Date().toISOString(),
	};
	state.active = [];
	state.past = [finished, pastRun];

	await expect(active.getByText('No run is in progress.')).toBeVisible({ timeout: 10_000 });
	await expect(past.getByText('arn-live')).toBeVisible({ timeout: 5_000 });
	await expect(past.getByText('healthy')).toBeVisible();
});

test('staff start an investigation and land on its run', async ({ page }, testInfo) => {
	await mockCentralManager(page, { active: [], past: [pastRun] });
	let body: unknown;
	await page.route('**/Admin/Investigation/', (route) => {
		if (route.request().method() !== 'POST') { return route.fallback(); }
		body = route.request().postDataJSON();
		return route.fulfill({
			status: 202,
			json: { id: 'arn-done', clusterId: 'clu-done', status: 'pending', attached: false },
		});
	});
	await page.route(/\/Admin\/ClusterMonitoringPolicy\/\?search=/, (route) =>
		route.fulfill({
			json: [{
				clusterId: 'clu-done',
				clusterName: 'checkout-prod',
				clusterStatus: 'RUNNING',
				organizationId: 'org-1',
				organizationName: 'Example Co',
				monitoringPolicy: 'page',
			}],
		}));
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto('/#/admin/agent');
	await page.getByRole('button', { name: 'Investigate a cluster' }).click();
	const dialog = page.getByRole('dialog', { name: 'Investigate a cluster' });
	await dialog.getByLabel('Cluster', { exact: true }).fill('checkout');
	await dialog.getByRole('list', { name: 'Matching clusters' }).getByRole('button', { name: /checkout-prod/ }).click();
	await page.screenshot({ path: testInfo.outputPath('agent-start-dialog.png') });
	await dialog.getByRole('button', { name: 'Start investigation' }).click();
	await expect(page).toHaveURL(/#\/admin\/agent\/arn-done$/);
	await expect(page.getByText('One member stopped serving after the restart.')).toBeVisible();
	expect(body).toEqual({ clusterId: 'clu-done', lookBackMinutes: 60, trigger: { kind: 'manual' } });
});
