import { expect, type Page, test } from '@playwright/test';
import { rememberAppSignIn } from './signInMarkers';

function log(message: string, offset = 0, node = 'node-a.us-east-1.example.test') {
	return {
		level: 'error',
		timestamp: new Date(Date.now() + offset).toISOString(),
		node,
		thread: 'http/2',
		tags: ['application'],
		message,
	};
}
async function serve(page: Page, logs: () => ReturnType<typeof log>[], requests: Record<string, unknown>[]) {
	await rememberAppSignIn(page);
	await page.addInitScript(() => {
		localStorage.setItem('Studio:PotentiallyAuthenticated:clu-logs', location.origin + '/logs-test-operations');
		localStorage.setItem('Studio:ExtensionsPrototype', JSON.stringify({ enabled: false, panelOpen: false }));
	});
	await page.route('**/*', route =>
		['fetch', 'xhr'].includes(route.request().resourceType())
			? route.fulfill({ status: 404, json: {} })
			: route.continue());
	const cluster = {
		id: 'clu-logs',
		name: 'Logs cluster',
		organizationId: 'org-logs',
		status: 'RUNNING',
		instances: [],
	};
	await page.route('**/User/current', route =>
		route.fulfill({
			json: {
				id: 'logs-user',
				email: 'logs@example.test',
				roles: {
					'org-logs': { organizationName: 'Logs organization', role: 'owner', permission: { super_user: true } },
				},
			},
		}));
	await page.route(
		'**/Organization/org-logs',
		route => route.fulfill({ json: { id: 'org-logs', name: 'Logs organization', clusters: [cluster] } }),
	);
	await page.route('**/Cluster/clu-logs', route => route.fulfill({ json: cluster }));
	await page.route('**/Region/**', route => route.fulfill({ json: [] }));
	await page.route('**/SystemStatus/**', route => route.fulfill({ json: [] }));
	await page.routeWebSocket('**/*', socket => socket.close());
	await page.route('**/logs-test-operations/**', route => {
		const body = route.request().postDataJSON();
		if (body.operation === 'read_log') {
			requests.push(body);
			const matching = logs().filter(log =>
				(!body.from || log.timestamp >= body.from) && (!body.until || log.timestamp <= body.until)
				&& (!body.level || log.level === body.level) && (!body.filter || log.message.includes(body.filter))
			);
			const rows = matching.slice(body.start ?? 0, (body.start ?? 0) + (body.limit ?? 1000));
			rows.sort((a, b) =>
				body.order === 'asc' ? a.timestamp.localeCompare(b.timestamp) : b.timestamp.localeCompare(a.timestamp)
			);
			return route.fulfill({ json: rows });
		}
		const responses: Record<string, unknown> = {
			user_info: { username: 'admin', role: { permission: { super_user: true } } },
			registration_info: { version: '5.4.0' },
			get_studio_configuration: { navigation: {}, pages: [] },
			get_status: { restartRequired: false },
			list_roles: [],
		};
		return route.fulfill({ json: responses[body.operation] ?? [] });
	});
}

for (const oldestFirst of [false, true]) {
	test(
		`live arrivals preserve the expanded reading position (${oldestFirst ? 'oldest' : 'newest'} first)`,
		async ({ page }, testInfo) => {
			let logs = [
				log('Error: connection refused\n    at connect (client.ts:42:9)'),
				...Array.from({ length: 39 }, (_, i) => log(`Previous log event ${i + 1}`, -(i + 1) * 1000)),
			];
			const requests: Record<string, unknown>[] = [];
			await serve(page, () => logs, requests);
			await page.addInitScript(value => localStorage.setItem('LogsOrderReversed', JSON.stringify(value)), oldestFirst);
			await page.setViewportSize({ width: 1440, height: 1000 });
			await page.goto('/#/org-logs/clu-logs/logs');
			await expect(page.getByRole('button', { name: 'Expand log 1', exact: true })).toBeVisible();
			await expect.poll(() =>
				page.locator('[data-slot="table-container"]').evaluate(
					(el, oldest) => oldest ? Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) : el.scrollTop,
					oldestFirst,
				)
			).toBeLessThan(2);
			await page.getByRole('button', { name: 'Expand log 1', exact: true }).click();
			await page.getByRole('button', { name: 'Refresh logs' }).click();
			await expect(page.getByLabel('Full log message')).toBeVisible();
			await page.getByRole('button', { name: 'Collapse log 1', exact: true }).click();
			await page.getByRole('switch', { name: 'Live logs' }).click();
			await page.getByRole('button', { name: 'Expand log 1', exact: true }).click();
			const message = await page.getByLabel('Full log message').textContent();
			const before = (await page.getByLabel('Full log message').boundingBox())!.y;
			logs = [log('New live event', 1000), ...logs];
			await expect(page.getByText('New live event', { exact: true })).toHaveCount(1, { timeout: 15000 });
			await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeVisible();
			await expect(page.getByLabel('Full log message')).toHaveText(message!);
			expect(Math.abs((await page.getByLabel('Full log message').boundingBox())!.y - before)).toBeLessThan(1);
			expect(requests.every(body => body.replicated === true)).toBe(true);
			expect(requests.filter(body => !body.until).length).toBeGreaterThan(0);
			await page.screenshot({ path: testInfo.outputPath('logs-inline.png'), fullPage: true });
			await page.getByRole('button', { name: 'Jump to latest' }).click();
			await expect(page.getByRole('button', { name: 'Jump to latest' })).toHaveCount(0);
			await expect(page.getByLabel('Full log message')).toHaveText(message!);
			await expect(page.getByText('New live event', { exact: true })).toBeVisible();
		},
	);
}

for (const oldestFirst of [false, true]) {
	test(`arrow keys inspect adjacent logs (${oldestFirst ? 'oldest' : 'newest'} first)`, async ({ page }) => {
		let logs = Array.from({ length: 40 }, (_, index) => log(`Keyboard event ${index}`, -index * 1000));
		await serve(page, () => logs, []);
		await page.addInitScript(value => localStorage.setItem('LogsOrderReversed', JSON.stringify(value)), oldestFirst);
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto('/#/org-logs/clu-logs/logs');
		await page.getByRole('switch', { name: 'Live logs' }).click();
		await page.getByRole('button', { name: 'Expand log 1', exact: true }).click();
		const original = await page.getByLabel('Full log message').textContent();
		await page.keyboard.press('ArrowUp');
		await expect(page.getByRole('button', { name: 'Collapse log 1', exact: true })).toBeFocused();
		await page.keyboard.press('ArrowDown');
		await expect(page.getByRole('button', { name: 'Collapse log 2', exact: true })).toBeFocused();
		await expect(page.getByLabel('Full log message')).not.toHaveText(original!);
		await page.keyboard.press('ArrowUp');
		await expect(page.getByLabel('Full log message')).toHaveText(original!);
		for (let i = 0; i < 10; i++) { await page.keyboard.press('ArrowDown'); }
		const active = page.getByRole('button', { name: 'Collapse log 11', exact: true });
		await expect(active).toBeFocused();
		const inspected = await page.getByLabel('Full log message').textContent();
		const scroller = await page.locator('[data-slot="table-container"]').boundingBox();
		await expect.poll(async () => {
			const box = await active.boundingBox();
			const details = await page.getByLabel('Full log message').locator('xpath=ancestor::tr').boundingBox();
			return box!.y >= scroller!.y + 40
				&& details!.y + details!.height <= Math.min(scroller!.y + scroller!.height, 1000) + 1;
		}).toBe(true);
		logs = [log('New event during keyboard inspection', 1000), ...logs];
		await expect(page.getByText('New event during keyboard inspection', { exact: true })).toHaveCount(1, {
			timeout: 15000,
		});
		await expect(page.getByLabel('Full log message')).toHaveText(inspected!);
		await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeVisible();
	});
}

for (const oldestFirst of [false, true]) {
	test(`reading context survives full buffer rotation (${oldestFirst ? 'oldest' : 'newest'} first)`, async ({ page }) => {
		let logs = Array.from({ length: 40 }, (_, i) => log(`Original ${i}`, -i * 1000));
		await serve(page, () => logs, []);
		await page.addInitScript(value => localStorage.setItem('LogsOrderReversed', JSON.stringify(value)), oldestFirst);
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto('/#/org-logs/clu-logs/logs');
		await page.getByRole('switch', { name: 'Live logs' }).click();
		const pane = page.locator('[data-slot="table-container"]');
		await pane.hover();
		await page.mouse.wheel(0, oldestFirst ? -500 : 500);
		await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeVisible();
		const anchor = await pane.evaluate(el => {
			const top = el.querySelector('thead')!.getBoundingClientRect().bottom;
			const button = Array.from(el.querySelectorAll<HTMLElement>('button[data-log-toggle]')).find(b =>
				b.closest('tr')!.getBoundingClientRect().bottom > top
			)!;
			return { key: button.dataset.logToggle!, y: button.getBoundingClientRect().y };
		});
		logs = Array.from({ length: 100 }, (_, i) => log(`Incoming ${i}`, (100 - i) * 1000));
		await expect(page.getByText('Incoming 0', { exact: true })).toHaveCount(1, { timeout: 15000 });
		const original = page.locator(`button[data-log-toggle="${anchor.key}"]`);
		await expect.poll(async () => Math.abs((await original.boundingBox())!.y - anchor.y)).toBeLessThan(1);
		if (oldestFirst) { await page.getByRole('button', { name: 'Jump to latest' }).click(); }
		else {
			await pane.hover();
			await page.mouse.wheel(0, -100000);
		}
		await expect(page.getByRole('button', { name: 'Jump to latest' })).toHaveCount(0);
		await expect(original).toHaveCount(0);
		logs = [log('Followed arrival', 200000), ...logs];
		await expect(page.getByText('Followed arrival', { exact: true })).toHaveCount(1, { timeout: 15000 });
		await expect.poll(() =>
			pane.evaluate(
				(el, oldest) => oldest ? el.scrollHeight - el.clientHeight - el.scrollTop : el.scrollTop,
				oldestFirst,
			)
		).toBeLessThan(2);
		await expect(page.getByRole('button', { name: 'Jump to latest' })).toHaveCount(0);
	});
}

test('a short expanded list stays still as rows are prepended', async ({ page }) => {
	let logs = [log('Short original'), log('Short older', -1000)];
	await serve(page, () => logs, []);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto('/#/org-logs/clu-logs/logs');
	await page.getByRole('switch', { name: 'Live logs' }).click();
	await page.getByRole('button', { name: 'Expand log 1', exact: true }).click();
	const before = (await page.getByLabel('Full log message').boundingBox())!.y;
	logs = [log('Short new', 1000), ...logs];
	await expect(page.getByText('Short new', { exact: true })).toHaveCount(1, { timeout: 15000 });
	expect(Math.abs((await page.getByLabel('Full log message').boundingBox())!.y - before)).toBeLessThan(1);
	await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeVisible();
});

test('opening a lower log reveals its details and tall entries show their beginning', async ({ page }) => {
	const logs = Array.from({ length: 40 }, (_, index) =>
		log(
			index === 12 ? 'Tall log start\n' + 'Stack trace line\n'.repeat(100) : `Mouse event ${index}`,
			-index * 1000,
		));
	await serve(page, () => logs, []);
	await page.setViewportSize({ width: 1440, height: 800 });
	await page.goto('/#/org-logs/clu-logs/logs');
	await page.getByRole('button', { name: 'Expand log 11', exact: true }).click();
	const scroller = page.locator('[data-slot="table-container"]');
	await expect.poll(async () => {
		const panel = await page.getByLabel('Full log message').locator('xpath=ancestor::tr').boundingBox();
		const viewport = await scroller.boundingBox();
		return panel!.y + panel!.height <= Math.min(viewport!.y + viewport!.height, 800) + 1;
	}).toBe(true);
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	await expect(page.getByRole('button', { name: 'Collapse log 13', exact: true })).toBeFocused();
	const header = await page.getByRole('columnheader', { name: 'Timestamp' }).boundingBox();
	const active = await page.getByRole('button', { name: 'Collapse log 13', exact: true }).boundingBox();
	const message = page.getByLabel('Full log message');
	const content = await message.boundingBox();
	const viewport = await scroller.boundingBox();
	expect(active!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
	expect(active!.y).toBeLessThan(header!.y + header!.height + 20);
	expect(content!.y).toBeLessThan(Math.min(viewport!.y + viewport!.height, 800) - 24);
	expect(await message.evaluate(el => el.scrollTop)).toBe(0);
});

test(
	'column controls and existing log links work across themes and mobile',
	async ({ page, context }, testInfo) => {
		const logs = [
			log('Error: request failed\n    at handler (api.ts:83:12)'),
			log('Request received', -1000),
			log('Other node event', -500, 'node-b'),
		];
		const requests: Record<string, unknown>[] = [];
		await serve(page, () => logs, requests);
		await page.goto('/#/org-logs/clu-logs/logs');
		await page.getByRole('button', { name: 'Expand log 1', exact: true }).click();
		const link = '/#/org-logs/clu-logs/logs?log=' + encodeURIComponent(JSON.stringify({
			timestamp: logs[0].timestamp,
			node: logs[0].node,
			thread: logs[0].thread,
			fingerprint: '1f8qa9i',
			source: 'hdb.log',
		}));
		const linkedPage = await context.newPage();
		await serve(linkedPage, () => logs, []);
		await linkedPage.goto(link);
		await expect(linkedPage.getByLabel('Full log message')).toContainText('Error: request failed');
		await expect(linkedPage).toHaveURL(/log=/);
		await linkedPage.close();
		await page.bringToFront();

		await page.getByRole('button', { name: 'Expand log 2', exact: true }).click();
		await expect(page.getByLabel('Full log message')).toHaveCount(2);
		await expect(page.getByRole('button', { name: /^(Copy message|Copy JSON|Copy link|View surrounding logs)$/ }))
			.toHaveCount(0);
		await page.getByRole('button', { name: 'Columns' }).click();
		await page.getByRole('menuitemcheckbox', { name: 'Tags' }).click();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('columnheader', { name: 'Tags' })).toBeVisible();
		const nodeHeader = page.getByRole('columnheader', { name: 'Node' });
		const nodeWidth = (await nodeHeader.boundingBox())!.width;
		await nodeHeader.locator('[class*="cursor-col-resize"]').dblclick();
		expect((await nodeHeader.boundingBox())!.width).not.toBe(nodeWidth);
		const header = page.getByRole('columnheader', { name: 'Message' });
		const before = (await header.boundingBox())!.width;
		const grip = header.locator('[class*="cursor-col-resize"]');
		const box = (await grip.boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + 100, box.y + box.height / 2);
		await page.mouse.up();
		expect((await header.boundingBox())!.width).toBeGreaterThan(before + 50);
		const timestampHeader = page.getByRole('columnheader', { name: 'Timestamp' });
		const timestampWidth = (await timestampHeader.boundingBox())!.width;
		const timestampGrip = (await timestampHeader.locator('[class*="cursor-col-resize"]').boundingBox())!;
		await page.mouse.move(timestampGrip.x + timestampGrip.width / 2, timestampGrip.y + timestampGrip.height / 2);
		await page.mouse.down();
		await page.mouse.move(timestampGrip.x + 85, timestampGrip.y + timestampGrip.height / 2);
		await page.mouse.up();
		expect((await timestampHeader.boundingBox())!.width).toBeGreaterThan(timestampWidth + 30);

		await page.goto(link);
		await expect(page.getByRole('columnheader', { name: 'Tags' })).toBeVisible();
		await expect(page.getByLabel('Full log message')).toContainText('Error: request failed');
		await page.screenshot({ path: testInfo.outputPath('logs-link.png'), fullPage: true });
		await page.evaluate(() => localStorage.setItem('Theme', JSON.stringify('dark')));
		await page.reload();
		await expect(page.locator('html')).toHaveClass(/dark/);
		await expect(page.getByLabel('Full log message')).toContainText('Error: request failed');
		const textColor = await page.getByLabel('Full log message').evaluate(el => getComputedStyle(el).color);
		expect(textColor).toBe('rgb(250, 250, 250)');
		await page.screenshot({ path: testInfo.outputPath('logs-dark.png'), fullPage: true });
		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
		await page.screenshot({ path: testInfo.outputPath('logs-mobile.png'), fullPage: true });
	},
);

test.describe('server clock context', () => {
	test.use({ timezoneId: 'America/New_York' });
	test('keeps generated dates valid when the server is ahead across midnight', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.clock.install({ time: new Date('2026-11-20T04:59:50Z') });
		const logs = [{ ...log('Server clock ahead'), timestamp: '2026-11-20T05:01:50.000Z' }];
		const requests: Record<string, unknown>[] = [];
		await serve(page, () => logs, requests);
		const link = '/#/org-logs/clu-logs/logs?log=' + encodeURIComponent(JSON.stringify({
			timestamp: logs[0].timestamp,
			node: logs[0].node,
			thread: logs[0].thread,
			fingerprint: '1rdd1kz',
			source: 'hdb.log',
		}));
		await page.goto(link);
		await expect(page.getByLabel('Full log message')).toHaveText('Server clock ahead');
		await page.getByRole('button', { name: 'Filters', exact: true }).click();
		const count = requests.length;
		await page.getByRole('button', { name: 'Apply Filters' }).click();
		await expect.poll(() => requests.length).toBeGreaterThan(count);
		expect(requests.at(-1)?.from).toBe('2026-11-20T05:01:20.000Z');
		expect(requests.at(-1)?.until).toBe('2026-11-20T05:02:20.000Z');
		await expect(page.getByRole('alert')).toHaveCount(0);
		await expect(page.getByText('Date cannot be after today')).toHaveCount(0);
	});
});
