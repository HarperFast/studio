/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { ConfigScheduledJobsIndex } from '.';

const METRICS_CONFIG = `rest: true
scheduler:
  jobs:
    - name: sync-rates
      interval: 10s
      handler: ./jobs.js#syncRates
    - name: flaky-report
      cron: '* * * * *'
      timezone: America/New_York
      handler: ./jobs.js#flakyReport
`;

const { state, post } = vi.hoisted(() => {
	const state = {
		canManage: true,
		version: '5.3.5',
		files: {} as Record<string, string>,
		stateFails: false,
	};
	const post = vi.fn();
	return { state, post };
});

vi.mock('@/config/useInstanceClient', () => {
	const params = { instanceClient: { post }, entityId: 'instance-1', entityType: 'instance' };
	return { useInstanceClientIdParams: () => params };
});
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => state.canManage }));
vi.mock('@/hooks/useRestartInstanceClick', () => ({
	useRestartInstanceClick: () => ({ onRestartClick: vi.fn(), isRestartPending: false }),
}));
vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ organizationId: 'org', clusterId: 'clu', instanceId: 'ins' }),
	Link: ({ children }: { children: React.ReactNode }) => <a href="#status">{children}</a>,
}));
vi.mock(
	'sonner',
	() => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), loading: vi.fn(), dismiss: vi.fn(), error: vi.fn() }) }),
);

function answer(body: Record<string, unknown>) {
	switch (body.operation) {
		case 'registration_info':
			return { version: state.version };
		case 'get_components':
			return {
				name: 'components',
				entries: [
					{
						name: 'metrics-app',
						entries: [{ name: 'config.yaml' }, { name: 'jobs.js' }],
						status: { status: 'healthy' },
					},
					{
						name: 'broken-app',
						entries: [{ name: 'config.yaml' }, { name: 'jobs.js' }],
						status: {
							status: 'error',
							details: {
								'broken-app.scheduler': { status: 'error', message: "Could not load component 'broken-app.scheduler'" },
							},
						},
					},
					{ name: 'quiet-app', entries: [{ name: 'resources.js' }] },
				],
			};
		case 'get_component_file':
			return { message: state.files[`${body.project}/${body.file}`] };
		case 'set_component_file':
			state.files[`${body.project}/${body.file}`] = body.payload as string;
			return { message: 'Successfully set component' };
		case 'search_by_value':
			if (state.stateFails) {
				throw new Error('state read failed');
			}
			// What harper 5.4.0-beta.2 answered for these apps.
			return [
				{
					id: 'job:metrics-app:flaky-report',
					firstSeenAt: '2026-11-05T22:19:19.745Z',
					lastRunAt: '2026-11-05T22:20:00.004Z',
					lastStatus: 'error',
					lastError: 'report service returned 503',
					lastDurationMs: 0,
				},
				{
					id: 'job:metrics-app:sync-rates',
					firstSeenAt: '2026-11-05T22:19:29.746Z',
					lastRunAt: '2026-11-05T22:20:29.753Z',
					lastStatus: 'success',
					lastDurationMs: 26,
				},
				{ id: 'leader', leaderNode: 'node-c', lastHeartbeat: new Date().toISOString() },
			];
		case 'read_log':
			return [
				{
					timestamp: '2026-11-05T21:45:20.494Z',
					level: 'error',
					tags: [],
					message:
						'SchedulerConfigError: Could not load component \'scheduler\' for application \'broken-app\' due to: Scheduler job "nightly" in component broken-app: "./jobs.js" has no function export named "missingExport"\n    at resolveHandler (/x.ts:1:1)',
				},
				{
					timestamp: '2026-11-05T21:45:00.001Z',
					level: 'warn',
					tags: ['scheduler'],
					message: 'Job job:metrics-app:flaky-report failed after 2ms: report service returned 503',
				},
				{
					timestamp: '2026-11-05T21:43:35.384Z',
					level: 'info',
					tags: ['scheduler'],
					message: 'Scheduler leader started on node-b',
				},
			];
		default:
			throw new Error(`unexpected ${String(body.operation)}`);
	}
}

function renderPage() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<ConfigScheduledJobsIndex />
		</QueryClientProvider>,
	);
}

const operationsSent = () => post.mock.calls.map(([, body]) => (body as { operation: string }).operation);

beforeEach(() => {
	Object.assign(state, {
		canManage: true,
		version: '5.3.5',
		stateFails: false,
		files: {
			'metrics-app/config.yaml': METRICS_CONFIG,
			'broken-app/config.yaml':
				"scheduler:\n  jobs:\n    - name: nightly\n      cron: '0 2 * * *'\n      handler: ./jobs.js#missingExport\n",
		},
	});
	post.mockReset();
	post.mockImplementation(async (_url: string, body: Record<string, unknown>) => ({ data: answer(body) }));
});

afterEach(cleanup);

describe('ConfigScheduledJobsIndex', () => {
	it('is for super users, and reads nothing for anyone else', () => {
		state.canManage = false;
		renderPage();
		expect(screen.getByText('Only super users can view or change scheduled jobs.')).toBeTruthy();
		expect(post).not.toHaveBeenCalled();
	});

	it('names the version it needs below 5.2.0-beta.2, and lists nothing', async () => {
		state.version = '5.2.0-beta.1';
		renderPage();
		expect(
			await screen.findByText('Scheduled jobs need Harper 5.2.0-beta.2 or later. This instance runs 5.2.0-beta.1.'),
		).toBeTruthy();
		expect(operationsSent()).toEqual(['registration_info']);
	});

	it("lists each app's jobs with their schedule and the last failure Harper logged", async () => {
		renderPage();
		const card = (await screen.findByText('metrics-app')).closest('[data-slot="card"]') as HTMLElement;
		const rows = await within(card).findAllByRole('row');
		expect(rows[1].textContent).toContain('sync-rates');
		expect(rows[1].textContent).toContain('every 10 seconds');
		expect(rows[1].textContent).toContain('None in the log');
		expect(rows[2].textContent).toContain('* * * * *');
		expect(rows[2].textContent).toContain('America/New_York');
		expect(rows[2].textContent).toContain('report service returned 503');
		expect(screen.getByText('node-b')).toBeTruthy();
		expect(screen.queryByText('quiet-app', { selector: '[data-slot="card-title"]' })).toBeNull();
	});

	it("shows Harper's own reason an app's jobs failed to load", async () => {
		renderPage();
		expect(await screen.findByText(/Harper couldn’t load this app’s jobs, so none of them run/)).toBeTruthy();
		expect(screen.getByText(/has no function export named "missingExport"/)).toBeTruthy();
	});

	it('never reads the scheduler state table below 5.4.0-beta.1, which refuses it and logs an error', async () => {
		renderPage();
		await screen.findByText('metrics-app');
		await waitFor(() => expect(operationsSent()).toContain('read_log'));
		expect(post.mock.calls.some(([, body]) => (body as { table?: string }).table === 'hdb_scheduler_state')).toBe(
			false,
		);
	});

	it('shows each job’s last run, and the node running them, where Harper lets Studio read them', async () => {
		state.version = '5.4.0-beta.2';
		renderPage();
		const card = (await screen.findByText('metrics-app')).closest('[data-slot="card"]') as HTMLElement;
		await within(card).findByText('Succeeded');
		const rows = within(card).getAllByRole('row');
		expect(rows[0].textContent).toContain('Last run');
		expect(rows[1].textContent).toContain('took 26 ms');
		expect(rows[2].textContent).toContain('Failed');
		expect(rows[2].textContent).toContain('report service returned 503');
		expect(screen.getByText('node-c')).toBeTruthy();
		const nightly = within(
			screen.getByText('broken-app', { selector: '[data-slot="card-title"]' }).closest(
				'[data-slot="card"]',
			) as HTMLElement,
		).getAllByRole('row')[1];
		expect(nightly.textContent).toContain('Not run yet');
	});

	it('falls back to the log when the state read fails', async () => {
		state.version = '5.4.0-beta.2';
		state.stateFails = true;
		renderPage();
		expect(await screen.findByText(/Studio couldn’t read each job’s last run \(state read failed\)/)).toBeTruthy();
		const card = screen.getByText('metrics-app').closest('[data-slot="card"]') as HTMLElement;
		expect(within(card).getAllByRole('row')[0].textContent).toContain('Last failure');
		expect(await within(card).findByText('report service returned 503')).toBeTruthy();
	});

	it('removes a job from the file, keeps the rest, and asks for a restart', async () => {
		renderPage();
		fireEvent.click(await screen.findByRole('button', { name: 'Remove sync-rates' }));
		fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
		expect(await screen.findByText('Harper keeps running the old jobs until the app restarts.')).toBeTruthy();
		expect(parse(state.files['metrics-app/config.yaml'])).toEqual({
			rest: true,
			scheduler: {
				jobs: [{
					name: 'flaky-report',
					cron: '* * * * *',
					timezone: 'America/New_York',
					handler: './jobs.js#flakyReport',
				}],
			},
		});
	});

	it('refuses to remove a job from a file someone changed since the page read it', async () => {
		renderPage();
		fireEvent.click(await screen.findByRole('button', { name: 'Remove sync-rates' }));
		const changedElsewhere = `${METRICS_CONFIG}# edited in the editor\n`;
		state.files['metrics-app/config.yaml'] = changedElsewhere;
		fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
		expect(await screen.findByText(/changed on the instance since this page loaded it/)).toBeTruthy();
		expect(state.files['metrics-app/config.yaml']).toBe(changedElsewhere);
	});

	it('never removes a different job after a refresh moves the one it was opened on', async () => {
		renderPage();
		fireEvent.click(await screen.findByRole('button', { name: 'Remove sync-rates' }));
		const inserted = METRICS_CONFIG.replace(
			'  jobs:\n',
			'  jobs:\n    - name: added-elsewhere\n      interval: 1h\n      handler: ./jobs.js#syncRates\n',
		);
		state.files['metrics-app/config.yaml'] = inserted;
		// What a window-focus refetch does while the dialog is open; the modal hides the page's own Refresh.
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Refresh', hidden: true }));
		});
		await waitFor(() => expect(screen.getAllByText('added-elsewhere').length).toBeGreaterThan(0));
		fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
		expect(await screen.findByText(/changed on the instance since this page loaded it/)).toBeTruthy();
		expect(state.files['metrics-app/config.yaml']).toBe(inserted);
	});
});
