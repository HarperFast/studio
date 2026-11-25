/**
 * @vitest-environment jsdom
 */
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, patch, del, post, navigate } = vi.hoisted(() => ({
	get: vi.fn(),
	patch: vi.fn(),
	del: vi.fn(),
	post: vi.fn(),
	navigate: vi.fn(),
}));
let granted = new Set<string>();

vi.mock('@/config/apiClient', () => ({ apiClient: { get, patch, post, delete: del } }));
vi.mock('@/hooks/useAuth', () => ({
	useStaffPermission: (permission: string) => granted.has(permission),
	useCloudAuth: () => ({ user: { fabricRole: 'fabric_admin' }, isLoading: false }),
}));
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: <T,>(value: T) => value }));
const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock('sonner', () => ({
	toast: Object.assign(vi.fn(), { error: toastError, success: toastSuccess, dismiss: vi.fn() }),
}));
vi.mock('@tanstack/react-router', () => ({
	Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
	useNavigate: () => navigate,
}));

import { monthLabel } from '@/features/admin/agent/components/SpendAndWatches';
import { mutationErrorHandler } from '@/react-query/queryClient';
import { AgentAdminIndex } from './index';

const ACTIVE_RUN = {
	id: 'arn-active',
	clusterId: 'clu-1',
	organizationId: 'org-1',
	role: 'investigator',
	triggerKind: 'failed_operation',
	status: 'running',
	stage: 'model',
	verdict: null,
	createdAt: '2026-11-17T10:00:00.000Z',
	startedAt: '2026-11-17T10:00:01.000Z',
	finishedAt: null,
	cost: { reservedUsd: 1, spentUsd: 0, spendKnown: false },
};
const PAST_RUN = {
	...ACTIVE_RUN,
	id: 'arn-past',
	clusterId: 'clu-2',
	status: 'completed',
	stage: 'finished',
	verdict: 'degraded',
	confidence: 'medium',
	finishedAt: '2026-11-17T10:00:43.000Z',
	cost: { reservedUsd: 1, spentUsd: 0.42, spendKnown: true },
};
const OVERVIEW = {
	month: '2026-11',
	agentEnabled: true,
	runBudgetUsd: 1,
	roles: [{
		role: 'investigator',
		enabled: true,
		monthlyBudgetUsd: 200,
		reservedUsd: 1,
		spentUsd: 3.42,
		runs: 17,
		updatedAt: null,
	}],
	settings: [
		{ name: 'AGENT_ENABLED', description: 'Global kill switch', value: true, superUserOnly: false },
		{ name: 'AGENT_RUN_BUDGET_USD', description: 'Per-run cap', value: 1, superUserOnly: false },
		{ name: 'GRAFANA_LOKI_URL', description: 'Loki', value: '', superUserOnly: true },
		{ name: 'AGENT_SLACK_CHANNEL', description: null, value: null, superUserOnly: false },
	],
};
const WATCH = {
	id: 'awt-1',
	runId: 'arn-past',
	clusterId: 'clu-2',
	kind: 'metric',
	key: 'replication_peers_connected',
	threshold: 2,
	firing: true,
	lastValue: 1,
	lastEvaluatedAt: '2026-11-17T10:15:00.000Z',
	expiresAt: '2026-12-01T10:00:00.000Z',
	clusterName: 'billing-api',
	organizationId: 'org-1',
	organizationName: 'Shared Co',
};

let activeRuns: unknown[];
let pastAnswer: () => Promise<unknown>;
let overview: typeof OVERVIEW;
let stored: Record<string, unknown>;

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
});

beforeEach(() => {
	granted = new Set(['agent:read', 'agent:run', 'config:write']);
	activeRuns = [ACTIVE_RUN];
	pastAnswer = async () => ({ data: [PAST_RUN] });
	overview = OVERVIEW;
	stored = { AGENT_ENABLED: true, AGENT_RUN_BUDGET_USD: 1 };
	get.mockReset();
	patch.mockReset();
	del.mockReset();
	post.mockReset();
	navigate.mockReset();
	toastError.mockReset();
	toastSuccess.mockReset();
	get.mockImplementation(async (url: string) => {
		if (url === '/Admin/AgentOverview/') { return { data: overview }; }
		if (url === '/Admin/AgentWatch/?limit(0,500)') { return { data: [WATCH] }; }
		if (url.startsWith('/Admin/Investigation/?status=active')) { return { data: activeRuns }; }
		if (url.startsWith('/Admin/Investigation/?')) { return pastAnswer(); }
		if (url.startsWith('/Admin/Configuration/')) {
			const name = url.slice('/Admin/Configuration/'.length);
			return { data: { name, value: stored[name] } };
		}
		throw new Error(`unexpected GET ${url}`);
	});
	patch.mockResolvedValue({ data: {} });
	del.mockResolvedValue({ data: { id: 'arn-active', status: 'cancelled' } });
});
afterEach(cleanup);

function renderPage() {
	// The production mutation handler, so a refused save's toast is part of what is tested.
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
	});
	render(
		<QueryClientProvider client={client}>
			<AgentAdminIndex />
		</QueryClientProvider>,
	);
	return client;
}

const pastUrls = () =>
	get.mock.calls.map(([url]) => url as string).filter((url) =>
		url.startsWith('/Admin/Investigation/?') && !url.includes('status=active')
	);

function openTab(name: string) {
	const tab = screen.getByRole('tab', { name });
	fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
	fireEvent.click(tab);
}

describe('AgentAdminIndex — activity', () => {
	it('shows an open run on top with its cluster, trigger, step and a Cancel action', async () => {
		renderPage();
		const active = await screen.findByRole('region', { name: 'Active runs' });
		await within(active).findByText('arn-active');
		expect(within(active).getByText('clu-1')).toBeTruthy();
		expect(within(active).getByText('Failed operation')).toBeTruthy();
		expect(within(active).getByText('Waiting on the model')).toBeTruthy();

		fireEvent.click(within(active).getByRole('button', { name: 'Cancel run arn-active' }));
		await waitFor(() => expect(del).toHaveBeenCalledWith('/Admin/Investigation/arn-active'));
	});

	it('offers no Cancel without agent:run', async () => {
		granted.delete('agent:run');
		renderPage();
		const active = await screen.findByRole('region', { name: 'Active runs' });
		await within(active).findByText('arn-active');
		expect(within(active).queryByRole('button', { name: /Cancel/ })).toBeNull();
	});

	it('lists finished runs, asked for with status=terminal, with verdict, duration and cost', async () => {
		renderPage();
		const past = await screen.findByRole('region', { name: 'Past runs' });
		await within(past).findByText('arn-past');
		expect(within(past).queryByText('arn-active')).toBeNull();
		expect(within(past).getByText('degraded')).toBeTruthy();
		expect(within(past).getByText('42s')).toBeTruthy();
		expect(within(past).getByText('$0.42')).toBeTruthy();
		expect(pastUrls()[0]).toBe('/Admin/Investigation/?status=terminal&limit(0,50)');
	});

	it('says so when nothing is running and no run matches', async () => {
		activeRuns = [];
		pastAnswer = async () => ({ data: [] });
		renderPage();
		expect(await screen.findByText('No run is in progress.')).toBeTruthy();
		expect(await screen.findByText('No run matches these filters.')).toBeTruthy();
	});

	it("shows the server's narrow-the-range refusal", async () => {
		pastAnswer = async () => {
			throw Object.assign(new Error('Request failed with status code 400'), {
				response: {
					status: 400,
					data: { error: 'More than 5000 runs were read before the page filled; narrow from and to' },
				},
			});
		};
		renderPage();
		const past = await screen.findByRole('region', { name: 'Past runs' });
		expect(await within(past).findByText(/More than 5000 runs were read before the page filled; narrow from and to/))
			.toBeTruthy();
	});

	it('filters by cluster and organization through the request', async () => {
		renderPage();
		const past = await screen.findByRole('region', { name: 'Past runs' });
		await within(past).findByText('arn-past');
		fireEvent.change(within(past).getByLabelText('Cluster id'), { target: { value: 'clu-2' } });
		fireEvent.change(within(past).getByLabelText('Organization id'), { target: { value: 'org-1' } });
		await waitFor(() =>
			expect(pastUrls()).toContain(
				'/Admin/Investigation/?status=terminal&clusterId=clu-2&organizationId=org-1&limit(0,50)',
			)
		);
	});

	it('shows cluster and organization names with their ids, and the id alone when the name is gone', async () => {
		pastAnswer = async () => ({ data: [{ ...PAST_RUN, clusterName: 'checkout-prod', organizationName: null }] });
		renderPage();
		const past = await screen.findByRole('region', { name: 'Past runs' });
		expect(await within(past).findByText('checkout-prod')).toBeTruthy();
		expect(within(past).getByText('clu-2')).toBeTruthy();
		expect(within(past).getByText('org-1')).toBeTruthy();
	});

	it('refetches the past list and spend as soon as a run leaves Active', async () => {
		const client = renderPage();
		const active = await screen.findByRole('region', { name: 'Active runs' });
		await within(active).findByText('arn-active');
		await screen.findByText('arn-past');
		const overviewReads = () => get.mock.calls.filter(([url]) => url === '/Admin/AgentOverview/').length;
		const before = { past: pastUrls().length, overview: overviewReads() };

		activeRuns = [];
		pastAnswer = async () => ({ data: [{ ...ACTIVE_RUN, status: 'completed', stage: 'finished' }, PAST_RUN] });
		await act(() =>
			client.refetchQueries({
				queryKey: ['fabric-admin', 'agent', 'runs', { range: { kind: 'default' }, status: 'active' }],
			})
		);

		await within(active).findByText('No run is in progress.');
		await waitFor(() => expect(pastUrls().length).toBeGreaterThan(before.past));
		await waitFor(() => expect(overviewReads()).toBeGreaterThan(before.overview));
		const past = screen.getByRole('region', { name: 'Past runs' });
		expect(await within(past).findByText('arn-active')).toBeTruthy();
	});
});

describe('AgentAdminIndex — spend and switched off', () => {
	it('shows month-to-date spend against the budget and the per-run cap', async () => {
		renderPage();
		const spend = await screen.findByRole('region', { name: 'Spend' });
		expect(within(spend).getByText('$3.42 of $200.00')).toBeTruthy();
		expect(within(spend).getByText('$1.00')).toBeTruthy();
		expect(within(spend).getByText(/17 runs this month/)).toBeTruthy();
		expect(within(spend).getByRole('heading').textContent).toBe(`Spend · ${monthLabel('2026-11')}`);
		expect(monthLabel('2026-11')).toMatch(/2026/);
		expect(monthLabel('not-a-month')).toBe('not-a-month');
	});

	it('says so when a spend refresh fails, keeping the last answer', async () => {
		const client = renderPage();
		expect(await screen.findByText('$3.42 of $200.00')).toBeTruthy();
		overview = [] as unknown as typeof OVERVIEW;
		await act(() => client.refetchQueries({ queryKey: ['fabric-admin', 'agent', 'overview'] }));
		expect(await screen.findByText(/Couldn't refresh from central manager/)).toBeTruthy();
		expect(screen.getByText('$3.42 of $200.00')).toBeTruthy();
	});

	it('says the agent is switched off', async () => {
		overview = { ...OVERVIEW, agentEnabled: false };
		renderPage();
		expect(await screen.findByText(/agent is switched off/)).toBeTruthy();
	});

	it('shows a spend load failure without hiding activity', async () => {
		overview = [] as unknown as typeof OVERVIEW;
		renderPage();
		expect(await screen.findByText(/Couldn't load spend/)).toBeTruthy();
		expect(await screen.findByText('arn-active')).toBeTruthy();
	});
});

describe('AgentAdminIndex — start a run', () => {
	const openDialog = async () => {
		fireEvent.click(await screen.findByRole('button', { name: 'Investigate a cluster' }));
		return screen.findByRole('dialog', { name: 'Investigate a cluster' });
	};

	it('offers Investigate only with agent:run', async () => {
		granted.delete('agent:run');
		renderPage();
		await screen.findByRole('region', { name: 'Spend' });
		expect(screen.queryByRole('button', { name: 'Investigate a cluster' })).toBeNull();
	});

	it('starts a manual run of the trimmed cluster id and opens it', async () => {
		post.mockResolvedValue({ data: { id: 'arn-new', clusterId: 'clu-9', status: 'pending', attached: false } });
		renderPage();
		const dialog = await openDialog();
		const start = within(dialog).getByRole('button', { name: 'Start investigation' });
		expect((start as HTMLButtonElement).disabled).toBe(true);
		expect(within(dialog).getByText(/at most \$1\.00/)).toBeTruthy();
		fireEvent.change(within(dialog).getByLabelText('Cluster id'), { target: { value: '  clu-9 ' } });
		fireEvent.change(within(dialog).getByLabelText('Reason (optional)'), { target: { value: ' replication alert ' } });
		fireEvent.click(start);
		await waitFor(() =>
			expect(navigate).toHaveBeenCalledWith({ to: '/admin/agent/$runId', params: { runId: 'arn-new' } })
		);
		expect(post).toHaveBeenCalledWith('/Admin/Investigation/', {
			clusterId: 'clu-9',
			lookBackMinutes: 60,
			trigger: { kind: 'manual', ref: 'replication alert' },
		});
		expect(toastSuccess).toHaveBeenCalledWith('Investigation started', { description: 'arn-new' });
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('sends no ref when the reason is blank, and says when it attached to an open run', async () => {
		post.mockResolvedValue({ data: { id: 'arn-active', clusterId: 'clu-1', status: 'running', attached: true } });
		renderPage();
		const dialog = await openDialog();
		fireEvent.change(within(dialog).getByLabelText('Cluster id'), { target: { value: 'clu-1' } });
		fireEvent.click(within(dialog).getByRole('button', { name: 'Start investigation' }));
		await waitFor(() =>
			expect(navigate).toHaveBeenCalledWith({ to: '/admin/agent/$runId', params: { runId: 'arn-active' } })
		);
		expect(post.mock.calls[0][1]).toEqual({ clusterId: 'clu-1', lookBackMinutes: 60, trigger: { kind: 'manual' } });
		expect(toastSuccess.mock.calls[0][0]).toBe('This cluster already has an open run');
	});

	it('keeps the dialog open with its input when central manager refuses the start', async () => {
		post.mockRejectedValue(Object.assign(new Error('Request failed with status code 429'), {
			isAxiosError: true,
			response: { status: 429, data: { error: 'The investigator role has spent its monthly budget' } },
			config: { method: 'post', url: '/Admin/Investigation/' },
		}));
		renderPage();
		const dialog = await openDialog();
		fireEvent.change(within(dialog).getByLabelText('Cluster id'), { target: { value: 'clu-9' } });
		fireEvent.click(within(dialog).getByRole('button', { name: 'Start investigation' }));
		await waitFor(() => expect(toastError).toHaveBeenCalled());
		expect(navigate).not.toHaveBeenCalled();
		expect(screen.getByRole('dialog', { name: 'Investigate a cluster' })).toBeTruthy();
		expect((within(dialog).getByLabelText('Cluster id') as HTMLInputElement).value).toBe('clu-9');
		await waitFor(() =>
			expect((within(dialog).getByRole('button', { name: 'Start investigation' }) as HTMLButtonElement).disabled).toBe(
				false,
			)
		);
	});

	it('says why no run can start while the agent is switched off, and does not send one', async () => {
		overview = { ...OVERVIEW, agentEnabled: false };
		renderPage();
		await screen.findByText(/agent is switched off/);
		const dialog = await openDialog();
		expect(within(dialog).getByRole('alert').textContent).toMatch(/agent is switched off/);
		fireEvent.change(within(dialog).getByLabelText('Cluster id'), { target: { value: 'clu-9' } });
		const start = within(dialog).getByRole('button', { name: 'Start investigation' });
		expect((start as HTMLButtonElement).disabled).toBe(true);
		fireEvent.submit(start.closest('form')!);
		expect(post).not.toHaveBeenCalled();
	});
});

describe('AgentAdminIndex — watches', () => {
	it('lists open watches with their state', async () => {
		renderPage();
		openTab('Watches');
		const watches = await screen.findByRole('region', { name: 'Watches' });
		await within(watches).findByText('replication_peers_connected');
		expect(within(watches).getByText('firing')).toBeTruthy();
		expect(within(watches).getByText('billing-api')).toBeTruthy();
		expect(within(watches).getByText('clu-2')).toBeTruthy();
		expect(within(watches).getByText('Shared Co')).toBeTruthy();
	});
});

describe('AgentAdminIndex — settings', () => {
	it('patches only the changed keys through the Configuration path', async () => {
		renderPage();
		openTab('Settings');
		const form = await screen.findByRole('form', { name: 'Agent settings' });
		fireEvent.click(within(form).getByRole('switch', { name: 'AGENT_ENABLED' }));
		fireEvent.click(within(form).getByRole('button', { name: 'Save 1 change' }));
		await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
		expect(patch).toHaveBeenCalledWith('/Admin/Configuration/AGENT_ENABLED', { value: false });
	});

	it('locks a super-user-only key and a key with no row, and shows each description', async () => {
		renderPage();
		openTab('Settings');
		const form = await screen.findByRole('form', { name: 'Agent settings' });
		expect((within(form).getByLabelText('GRAFANA_LOKI_URL') as HTMLInputElement).disabled).toBe(true);
		expect(within(form).getByText('Global kill switch')).toBeTruthy();
		expect(within(form).getByText(/no Configuration row/)).toBeTruthy();
		expect(within(form).getByText('Switches')).toBeTruthy();
		expect(within(form).getByText('Data sources')).toBeTruthy();
	});

	it('is read-only without config:write', async () => {
		granted.delete('config:write');
		renderPage();
		openTab('Settings');
		const form = await screen.findByRole('form', { name: 'Agent settings' });
		expect(within(form).getByText(/needs the config:write permission/)).toBeTruthy();
		expect((within(form).getByRole('switch', { name: 'AGENT_ENABLED' }) as HTMLButtonElement).disabled).toBe(true);
		expect(within(form).queryByRole('button', { name: /Save/ })).toBeNull();
	});
});

describe('AgentAdminIndex — review regressions', () => {
	it('refuses a stale draft after someone else changed the key, even once the page has refetched', async () => {
		const client = renderPage();
		openTab('Settings');
		const form = await screen.findByRole('form', { name: 'Agent settings' });
		fireEvent.change(within(form).getByLabelText('AGENT_RUN_BUDGET_USD'), { target: { value: '2' } });

		stored.AGENT_RUN_BUDGET_USD = 5;
		overview = {
			...OVERVIEW,
			settings: OVERVIEW.settings.map((row) =>
				(row.name === 'AGENT_RUN_BUDGET_USD' ? { ...row, value: 5 } : row) as (typeof OVERVIEW.settings)[number]
			),
		};
		await act(() => client.refetchQueries({ queryKey: ['fabric-admin', 'agent', 'overview'] }));
		expect(await within(form).findByText(/Changed by someone else since you started editing/)).toBeTruthy();
		expect((within(form).getByLabelText('AGENT_RUN_BUDGET_USD') as HTMLInputElement).value).toBe('2');

		fireEvent.click(within(form).getByRole('button', { name: 'Save 1 change' }));
		await waitFor(() =>
			expect(get.mock.calls.some(([url]) => url === '/Admin/Configuration/AGENT_RUN_BUDGET_USD')).toBe(true)
		);
		await waitFor(() =>
			expect(toastError).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ description: expect.stringContaining('was changed by someone else') }),
			)
		);
		expect(patch).not.toHaveBeenCalled();
		expect((within(form).getByLabelText('AGENT_RUN_BUDGET_USD') as HTMLInputElement).value).toBe('2');
	});

	it('keeps the baseline when a draft only happens to match a value someone else saved', async () => {
		const client = renderPage();
		openTab('Settings');
		const form = await screen.findByRole('form', { name: 'Agent settings' });
		const input = () => within(form).getByLabelText('AGENT_RUN_BUDGET_USD');
		fireEvent.change(input(), { target: { value: '10' } });

		stored.AGENT_RUN_BUDGET_USD = 10;
		overview = {
			...OVERVIEW,
			settings: OVERVIEW.settings.map((row) =>
				(row.name === 'AGENT_RUN_BUDGET_USD' ? { ...row, value: 10 } : row) as (typeof OVERVIEW.settings)[number]
			),
		};
		await act(() => client.refetchQueries({ queryKey: ['fabric-admin', 'agent', 'overview'] }));
		fireEvent.change(input(), { target: { value: '100' } });

		expect(await within(form).findByText(/Changed by someone else since you started editing/)).toBeTruthy();
		fireEvent.click(within(form).getByRole('button', { name: 'Save 1 change' }));
		await waitFor(() => expect(toastError).toHaveBeenCalled());
		expect(patch).not.toHaveBeenCalled();
	});

	it('keeps the baseline after an earlier successful save of the same key', async () => {
		const client = renderPage();
		openTab('Settings');
		const form = await screen.findByRole('form', { name: 'Agent settings' });
		const input = () => within(form).getByLabelText('AGENT_RUN_BUDGET_USD');
		const serverHas = (value: number) => {
			stored.AGENT_RUN_BUDGET_USD = value;
			overview = {
				...OVERVIEW,
				settings: OVERVIEW.settings.map((row) =>
					(row.name === 'AGENT_RUN_BUDGET_USD' ? { ...row, value } : row) as (typeof OVERVIEW.settings)[number]
				),
			};
		};
		fireEvent.change(input(), { target: { value: '2' } });
		patch.mockImplementationOnce(async () => {
			serverHas(2);
			return { data: {} };
		});
		fireEvent.click(within(form).getByRole('button', { name: 'Save 1 change' }));
		await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
		await waitFor(() => expect((input() as HTMLInputElement).value).toBe('2'));
		await waitFor(() => expect(within(form).queryByRole('button', { name: /Save \d/ })).toBeNull());

		fireEvent.change(input(), { target: { value: '10' } });
		serverHas(10);
		await act(() => client.refetchQueries({ queryKey: ['fabric-admin', 'agent', 'overview'] }));
		fireEvent.change(input(), { target: { value: '100' } });
		fireEvent.click(within(form).getByRole('button', { name: 'Save 1 change' }));
		await waitFor(() => expect(toastError).toHaveBeenCalled());
		expect(patch).toHaveBeenCalledTimes(1);
	});

	it('after an unanswered save, keeps the baseline for a value this form never sent', async () => {
		const client = renderPage();
		openTab('Settings');
		const form = await screen.findByRole('form', { name: 'Agent settings' });
		const input = () => within(form).getByLabelText('AGENT_RUN_BUDGET_USD');
		const serverHas = (value: number) => {
			stored.AGENT_RUN_BUDGET_USD = value;
			overview = {
				...OVERVIEW,
				settings: OVERVIEW.settings.map((row) =>
					(row.name === 'AGENT_RUN_BUDGET_USD' ? { ...row, value } : row) as (typeof OVERVIEW.settings)[number]
				),
			};
		};
		fireEvent.change(input(), { target: { value: '2' } });
		patch.mockImplementationOnce(async () => {
			throw Object.assign(new Error('timeout of 60000ms exceeded'), {
				isAxiosError: true,
				code: 'ECONNABORTED',
				config: { method: 'patch', url: '/Admin/Configuration/AGENT_RUN_BUDGET_USD' },
			});
		});
		fireEvent.click(within(form).getByRole('button', { name: 'Save 1 change' }));
		await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(String(toastError.mock.calls[0]?.[0])).toMatch(/unknown/i));
		await waitFor(() => expect(within(form).getByRole('button', { name: 'Save 1 change' })).toBeTruthy());

		fireEvent.change(input(), { target: { value: '7' } });
		serverHas(7);
		await act(() => client.refetchQueries({ queryKey: ['fabric-admin', 'agent', 'overview'] }));
		fireEvent.change(input(), { target: { value: '70' } });
		fireEvent.click(within(form).getByRole('button', { name: 'Save 1 change' }));
		// Settled either way: a refusal toasts, an overwrite PATCHes.
		await waitFor(() => expect(toastError.mock.calls.length + patch.mock.calls.length).toBeGreaterThanOrEqual(3));
		expect(patch).toHaveBeenCalledTimes(1);
	});

	it('keeps an unsaved settings edit across a tab switch', async () => {
		renderPage();
		openTab('Settings');
		let form = await screen.findByRole('form', { name: 'Agent settings' });
		fireEvent.change(within(form).getByLabelText('AGENT_RUN_BUDGET_USD'), { target: { value: '3' } });
		openTab('Watches');
		await screen.findByRole('region', { name: 'Watches' });
		openTab('Settings');
		form = await screen.findByRole('form', { name: 'Agent settings' });
		expect((within(form).getByLabelText('AGENT_RUN_BUDGET_USD') as HTMLInputElement).value).toBe('3');
		expect(within(form).getByRole('button', { name: 'Save 1 change' })).toBeTruthy();
	});

	it('refetches spend when a run finishes while another tab is showing', async () => {
		const client = renderPage();
		await screen.findByText('arn-active');
		openTab('Watches');
		await screen.findByRole('region', { name: 'Watches' });
		const overviewReads = () => get.mock.calls.filter(([url]) => url === '/Admin/AgentOverview/').length;
		const before = overviewReads();

		activeRuns = [];
		await act(() =>
			client.refetchQueries({
				queryKey: ['fabric-admin', 'agent', 'runs', { range: { kind: 'default' }, status: 'active' }],
			})
		);
		await waitFor(() => expect(overviewReads()).toBeGreaterThan(before));
	});

	it('clears the drafts a save wrote even when it settles after the Settings tab was left', async () => {
		let land: () => void = () => {};
		patch.mockImplementation(() =>
			new Promise((resolve) => {
				land = () => resolve({ data: {} });
			})
		);
		renderPage();
		openTab('Settings');
		let form = await screen.findByRole('form', { name: 'Agent settings' });
		fireEvent.change(within(form).getByLabelText('AGENT_RUN_BUDGET_USD'), { target: { value: '2' } });
		fireEvent.click(within(form).getByRole('button', { name: 'Save 1 change' }));
		await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));

		openTab('Watches');
		await screen.findByRole('region', { name: 'Watches' });
		stored.AGENT_RUN_BUDGET_USD = 2;
		overview = {
			...OVERVIEW,
			settings: OVERVIEW.settings.map((row) =>
				(row.name === 'AGENT_RUN_BUDGET_USD' ? { ...row, value: 2 } : row) as (typeof OVERVIEW.settings)[number]
			),
		};
		await act(async () => land());

		openTab('Settings');
		form = await screen.findByRole('form', { name: 'Agent settings' });
		await waitFor(() =>
			expect((within(form).getByLabelText('AGENT_RUN_BUDGET_USD') as HTMLInputElement).value).toBe('2')
		);
		expect(within(form).queryByText(/Changed by someone else/)).toBeNull();
		expect(within(form).queryByRole('button', { name: /Save \d/ })).toBeNull();
	});
});
