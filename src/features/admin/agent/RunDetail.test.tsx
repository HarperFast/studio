/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
let granted = new Set<string>();

vi.mock('@/config/apiClient', () => ({ apiClient: { get, delete: vi.fn() } }));
vi.mock('@/hooks/useAuth', () => ({ useStaffPermission: (permission: string) => granted.has(permission) }));
vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ runId: 'arn-1' }),
	Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import { RunDetailPage } from './RunDetail';

const RUN = {
	id: 'arn-1',
	clusterId: 'clu-1',
	organizationId: 'org-1',
	role: 'investigator',
	triggerKind: 'failed_operation',
	trigger: { kind: 'failed_operation', ref: 'op-9', windowMinutes: 60, operation: 'restart', reason: 'timed out' },
	status: 'completed',
	stage: 'finished',
	verdict: 'degraded',
	confidence: 'high',
	createdAt: '2026-11-17T10:00:00.000Z',
	startedAt: '2026-11-17T10:00:00.000Z',
	finishedAt: '2026-11-17T10:00:30.000Z',
	cost: { reservedUsd: 1, spentUsd: 0.31, spendKnown: true },
	blindSpots: ['host_logs: timed out'],
	evidence: [
		{
			id: 'ev-status',
			name: 'get_status',
			status: 'ok',
			coverage: 'complete',
			bytes: 2048,
			durationMs: 120,
			text: 'STATUS TEXT',
		},
		{ id: 'ev-logs', name: 'host_logs', status: 'blind_spot', coverage: 'none', reason: 'timed out', bytes: 0 },
	],
	brief: 'THE BRIEF',
	finding: {
		triage: { verdict: 'degraded', summary: 'One member is not serving.' },
		hypotheses: [{ cause: 'Disk filled on member 2', confidence: 'high', evidence: ['ev-status'], against: [] }],
		blindSpots: ['metrics unavailable'],
		rejected: [{ cause: 'Network partition', reason: 'peers connected' }],
		captureBeforeRestart: ['heap snapshot'],
		nextStep: 'Free disk on member 2.',
	},
	watches: [],
};

beforeEach(() => {
	granted = new Set(['agent:read']);
	get.mockReset();
	get.mockResolvedValue({ data: RUN });
});
afterEach(cleanup);

function renderPage() {
	render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
			<RunDetailPage />
		</QueryClientProvider>,
	);
}

describe('RunDetailPage', () => {
	it('shows the trigger, finding, blind spots, evidence and cost', async () => {
		renderPage();
		expect(await screen.findByText('One member is not serving.')).toBeTruthy();
		expect(get).toHaveBeenCalledWith('/Admin/Investigation/arn-1');
		expect(screen.getByText('restart')).toBeTruthy();
		expect(screen.getByText('Disk filled on member 2')).toBeTruthy();
		expect(screen.getByText('Network partition: peers connected')).toBeTruthy();
		expect(screen.getByText('Free disk on member 2.')).toBeTruthy();
		expect(screen.getByText('$0.31')).toBeTruthy();

		const blind = screen.getByRole('region', { name: 'Blind spots' });
		expect(within(blind).getByText('host_logs: timed out')).toBeTruthy();
		expect(within(blind).getByText('metrics unavailable')).toBeTruthy();

		const evidence = screen.getByRole('region', { name: 'Evidence' });
		expect(within(evidence).getByText('get_status')).toBeTruthy();
		expect(within(evidence).getByText('blind spot')).toBeTruthy();
		expect(within(evidence).getByText('2.0 KiB')).toBeTruthy();
	});

	it('keeps the brief and evidence text behind an explicit expand', async () => {
		renderPage();
		await screen.findByText('One member is not serving.');
		expect(screen.queryByText('THE BRIEF')).toBeNull();
		expect(screen.queryByText('STATUS TEXT')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Show brief' }));
		expect(screen.getByText('THE BRIEF')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Show get_status text' }));
		expect(screen.getByText('STATUS TEXT')).toBeTruthy();
	});

	it('offers Cancel only on an open run and only with agent:run', async () => {
		granted.add('agent:run');
		get.mockResolvedValue({ data: { ...RUN, status: 'running', stage: 'gathering', finishedAt: null, finding: null } });
		renderPage();
		expect(await screen.findByRole('button', { name: 'Cancel run arn-1' })).toBeTruthy();
		expect(screen.getByText('No finding yet.')).toBeTruthy();
		cleanup();

		granted.delete('agent:run');
		renderPage();
		await screen.findByText('No finding yet.');
		expect(screen.queryByRole('button', { name: /Cancel/ })).toBeNull();
	});

	it('says why a run could not be loaded', async () => {
		get.mockRejectedValue(
			Object.assign(new Error('x'), { response: { status: 404, data: { error: 'Investigation not found' } } }),
		);
		renderPage();
		expect(await screen.findByText(/Couldn't load this run: Investigation not found/)).toBeTruthy();
	});
});
