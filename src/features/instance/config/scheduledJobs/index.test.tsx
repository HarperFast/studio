/**
 * @vitest-environment jsdom
 */
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
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

const { state, post, restart } = vi.hoisted(() => {
	const state = {
		canManage: true,
		version: '5.3.5',
		files: {} as Record<string, string>,
		stateFails: false,
		writeAnswerLost: false,
		logFails: false,
		restartRequired: false,
		garbledTimes: false,
		heartbeatAgoMs: 0,
		entityId: 'instance-1',
	};
	const post = vi.fn();
	const restart = { clicks: 0, succeeded: undefined as (() => void) | undefined };
	return { state, post, restart };
});

vi.mock('@/config/useInstanceClient', () => {
	const byEntity = new Map<string, object>();
	const paramsFor = (entityId: string) => {
		if (!byEntity.has(entityId)) {
			byEntity.set(entityId, { instanceClient: { post }, entityId, entityType: 'instance' });
		}
		return byEntity.get(entityId);
	};
	return { useInstanceClientIdParams: () => paramsFor(state.entityId) };
});
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => state.canManage }));
vi.mock('@/hooks/useRestartInstanceClick', () => ({
	useRestartInstanceClick: (options: { onRestartedSuccessfully?: () => void }) => {
		restart.succeeded = options.onRestartedSuccessfully;
		return { onRestartClick: () => void (restart.clicks += 1), isRestartPending: false };
	},
}));
vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ organizationId: 'org', clusterId: 'clu', instanceId: 'ins' }),
	useLoaderData: () => ({ version: state.version }),
	Link: ({ children }: { children: React.ReactNode }) => <a href="#status">{children}</a>,
}));
vi.mock(
	'sonner',
	() => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), loading: vi.fn(), dismiss: vi.fn(), error: vi.fn() }) }),
);

function answer(body: Record<string, unknown>) {
	switch (body.operation) {
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
			if (state.writeAnswerLost) {
				// The write landed; the answer timed out on the way back.
				throw new AxiosError('timeout of 300000ms exceeded', AxiosError.ECONNABORTED, {
					data: JSON.stringify(body),
				} as InternalAxiosRequestConfig);
			}
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
					lastRunAt: state.garbledTimes ? 'not a time' : '2026-11-05T22:20:29.753Z',
					lastStatus: 'success',
					lastDurationMs: 26,
				},
				{
					id: 'leader',
					leaderNode: 'node-c',
					lastHeartbeat: state.garbledTimes ? 'garbled' : new Date(Date.now() - state.heartbeatAgoMs).toISOString(),
				},
			];
		case 'get_status':
			return { restartRequired: state.restartRequired };
		case 'read_log':
			if (state.logFails) {
				throw new Error('log read failed');
			}
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
		writeAnswerLost: false,
		logFails: false,
		restartRequired: false,
		garbledTimes: false,
		heartbeatAgoMs: 0,
		entityId: 'instance-1',
		files: {
			'metrics-app/config.yaml': METRICS_CONFIG,
			'broken-app/config.yaml':
				"scheduler:\n  jobs:\n    - name: nightly\n      cron: '0 2 * * *'\n      handler: ./jobs.js#missingExport\n",
		},
	});
	Object.assign(restart, { clicks: 0, succeeded: undefined });
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
		expect(operationsSent()).toEqual([]);
	});

	it("lists each app's jobs with their schedule and the last failure Harper logged", async () => {
		renderPage();
		const card = (await screen.findByText('metrics-app')).closest('[data-slot="card"]') as HTMLElement;
		const rows = await within(card).findAllByRole('row');
		expect(rows[1].textContent).toContain('sync-rates');
		expect(rows[1].textContent).toContain('every 10 seconds');
		expect(rows[1].textContent).toContain('None in about the last 1,000 log lines');
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

	it('doesn’t read the state table until an app declares a job, since Harper logs each read before then as an error', async () => {
		state.version = '5.4.0-beta.2';
		state.files = { 'metrics-app/config.yaml': 'rest: true\n', 'broken-app/config.yaml': 'rest: true\n' };
		renderPage();
		await waitFor(() => expect(operationsSent()).toContain('read_log'));
		await waitFor(() =>
			expect(operationsSent().filter((operation) => operation === 'get_component_file')).toHaveLength(2)
		);
		expect(post.mock.calls.some(([, body]) => (body as { table?: string }).table === 'hdb_scheduler_state')).toBe(
			false,
		);
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

	it('falls back to the log when a refetch of the state fails, not to the last answer', async () => {
		state.version = '5.4.0-beta.2';
		renderPage();
		const card = (await screen.findByText('metrics-app')).closest('[data-slot="card"]') as HTMLElement;
		await within(card).findByText('Succeeded');
		state.stateFails = true;
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
		});
		expect(await screen.findByText(/Studio couldn’t read each job’s last run/)).toBeTruthy();
		expect(within(card).queryByText('Succeeded')).toBeNull();
		expect(within(card).getAllByRole('row')[0].textContent).toContain('Last failure');
	});

	it('judges the leader’s check-in by when Studio read it, so a cached read shows no false warning', async () => {
		state.version = '5.4.0-beta.2';
		renderPage();
		await screen.findByText('node-c');
		const later = Date.now() + 10 * 60_000;
		const now = vi.spyOn(Date, 'now').mockImplementation(() => later);
		try {
			// Any re-render, without a refetch of the state.
			fireEvent.click(await screen.findByRole('button', { name: 'Change sync-rates' }));
			await screen.findByRole('textbox', { name: 'Interval' });
			expect(screen.queryByText(/longer than Harper waits/)).toBeNull();
		} finally {
			now.mockRestore();
		}
	});

	it('warns when the leader’s check-in was already old when Studio read it', async () => {
		state.version = '5.4.0-beta.2';
		state.heartbeatAgoMs = 10 * 60_000;
		renderPage();
		expect(await screen.findByText(/longer than Harper waits before another node takes over/)).toBeTruthy();
	});

	it('doesn’t read the log again on a return to the tab, which can cost Harper a whole-file scan', async () => {
		renderPage();
		await screen.findByText('metrics-app');
		const sent = (operation: string) => operationsSent().filter((sentOperation) => sentOperation === operation).length;
		await waitFor(() => expect(sent('read_log')).toBe(1));
		const components = sent('get_components');
		const later = Date.now() + 60_000;
		const now = vi.spyOn(Date, 'now').mockImplementation(() => later);
		try {
			await act(async () => {
				focusManager.setFocused(false);
				focusManager.setFocused(true);
			});
			await waitFor(() => expect(sent('get_components')).toBeGreaterThan(components));
			expect(sent('read_log')).toBe(1);
		} finally {
			now.mockRestore();
			focusManager.setFocused(undefined);
		}
	});

	it('survives timestamps it cannot read', async () => {
		state.version = '5.4.0-beta.2';
		state.garbledTimes = true;
		renderPage();
		expect(await screen.findByText('at an unreadable time')).toBeTruthy();
		expect(screen.getByText(/hasn’t recorded a check-in/)).toBeTruthy();
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

	it('still offers the restart when a removal’s answer is lost, since it may have landed', async () => {
		state.writeAnswerLost = true;
		renderPage();
		fireEvent.click(await screen.findByRole('button', { name: 'Remove sync-rates' }));
		fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
		expect(await screen.findByText('Harper keeps running the old jobs until the app restarts.')).toBeTruthy();
	});

	it('keeps the restart prompt for a removal saved while a restart was already running', async () => {
		renderPage();
		fireEvent.click(await screen.findByRole('button', { name: 'Remove sync-rates' }));
		fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
		fireEvent.click(await screen.findByRole('button', { name: 'Restart now' }));
		expect(restart.clicks).toBe(1);
		fireEvent.click(await screen.findByRole('button', { name: 'Remove flaky-report' }));
		fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
		await waitFor(() => expect(state.files['metrics-app/config.yaml']).not.toContain('flaky-report'));
		await act(async () => {
			restart.succeeded?.();
		});
		expect(screen.getByText('Harper keeps running the old jobs until the app restarts.')).toBeTruthy();
	});

	it('stops showing what the log said once a refetch of it fails', async () => {
		renderPage();
		expect(await screen.findByText('node-b')).toBeTruthy();
		state.logFails = true;
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
		});
		expect(await screen.findByText(/Studio couldn’t read Harper’s log: log read failed/)).toBeTruthy();
		expect(screen.queryByText('node-b')).toBeNull();
		expect(screen.queryByText(/has no function export named/)).toBeNull();
	});

	it('offers the restart whenever Harper says one is required, as after a save made before leaving the page', async () => {
		state.restartRequired = true;
		renderPage();
		expect(await screen.findByText('Harper keeps running the old jobs until the app restarts.')).toBeTruthy();
	});

	it('drops an open dialog when the page moves to another instance', async () => {
		const { rerender } = renderPage();
		fireEvent.click(await screen.findByRole('button', { name: 'Remove sync-rates' }));
		expect(await screen.findByText('Remove sync-rates?')).toBeTruthy();
		state.entityId = 'instance-2';
		rerender(
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<ConfigScheduledJobsIndex />
			</QueryClientProvider>,
		);
		expect(screen.queryByText('Remove sync-rates?')).toBeNull();
	});

	it('reopens a job from the file, not from the edits a cancelled dialog left', async () => {
		renderPage();
		fireEvent.click(await screen.findByRole('button', { name: 'Change sync-rates' }));
		const interval = async () => (await screen.findByRole('textbox', { name: 'Interval' })) as HTMLInputElement;
		fireEvent.change(await interval(), { target: { value: '15m' } });
		expect((await interval()).value).toBe('15m');
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Interval' })).toBeNull());
		fireEvent.click(screen.getByRole('button', { name: 'Change sync-rates' }));
		expect((await interval()).value).toBe('10s');
	});

	it('keeps an app with no config file in the Add list after a refresh', async () => {
		renderPage();
		await screen.findByText('metrics-app', { selector: '[data-slot="card-title"]' });
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
		});
		await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' }).hasAttribute('disabled')).toBe(false));
		expect(post.mock.calls.some(([, body]) => (body as { project?: string }).project === 'quiet-app')).toBe(false);
	});
});
