import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get, patch } }));

import {
	activeRunsQueryOptions,
	FAST_POLL_MS,
	getAgentOverview,
	getRun,
	getRuns,
	invalidateRunLists,
	runDetailQueryOptions,
	runListInterval,
	runListQueryOptions,
	runListQueryString,
	runPath,
	RunSummary,
	saveAgentSettings,
	SLOW_POLL_MS,
} from '@/features/admin/agent/agentAdminApi';

const NOW = Date.parse('2026-11-17T12:00:00.000Z');
const run = (status: string): RunSummary => ({
	id: `arn-${status}`,
	status,
	clusterId: 'clu-1',
	role: 'investigator',
	triggerKind: 'manual',
	stage: 'finished',
	createdAt: '2026-11-17T11:00:00Z',
});

beforeEach(() => {
	get.mockReset();
	patch.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('runListQueryString', () => {
	it('sends only the default page when nothing is filtered, so the server applies its 30-day range', () => {
		expect(runListQueryString({ range: { kind: 'default' } }, 0, NOW)).toBe('limit(0,50)');
	});

	it('pages with Harper limit(start,end), the end exclusive', () => {
		expect(runListQueryString({ range: { kind: 'default' } }, 50, NOW)).toBe('limit(50,100)');
	});

	it('sends every set filter, trimmed and encoded, and leaves out blank ones', () => {
		const query = runListQueryString(
			{
				range: { kind: 'default' },
				status: 'completed',
				triggerKind: 'failed_operation',
				verdict: 'down',
				clusterId: ' clu 1 ',
				organizationId: '',
			},
			0,
			NOW,
		);
		expect(query).toBe('status=completed&triggerKind=failed_operation&verdict=down&clusterId=clu%201&limit(0,50)');
	});

	it('resolves a trailing span against the time of the request, sending from alone', () => {
		const query = runListQueryString({ range: { kind: 'last', hours: 24 } }, 0, NOW);
		expect(query).toBe(`from=${encodeURIComponent('2026-11-16T12:00:00.000Z')}&limit(0,50)`);
	});

	it('asks for every finished status with status=terminal, filtered on the server', () => {
		expect(runListQueryString({ range: { kind: 'default' }, status: 'terminal' }, 0, NOW)).toBe(
			'status=terminal&limit(0,50)',
		);
	});

	it('sends both days of an explicit range', () => {
		const query = runListQueryString({ range: { kind: 'between', from: '2026-11-01', to: '2026-11-08' } }, 0, NOW);
		expect(query).toBe('from=2026-11-01&to=2026-11-08&limit(0,50)');
	});
});

describe('runListInterval', () => {
	it('polls every 5 s while the answer shows an open run', () => {
		expect(runListInterval({ range: { kind: 'default' } }, [run('completed'), run('running')])).toBe(FAST_POLL_MS);
		expect(runListInterval({ range: { kind: 'default' } }, [run('pending')])).toBe(FAST_POLL_MS);
	});

	it('polls every 5 s for the status=active view even when it is empty', () => {
		expect(runListInterval({ range: { kind: 'default' }, status: 'active' }, [])).toBe(FAST_POLL_MS);
	});

	it('polls every 30 s otherwise, including before the first answer', () => {
		expect(runListInterval({ range: { kind: 'default' } }, [run('completed'), run('error')])).toBe(SLOW_POLL_MS);
		expect(runListInterval({ range: { kind: 'default' }, verdict: 'down' }, undefined)).toBe(SLOW_POLL_MS);
	});
});

describe('run list paging', () => {
	it('asks for the largest page for the top open-run list only; other views page at 50', () => {
		expect(activeRunsQueryOptions().queryKey.at(-1)).toBe(200);
		expect(runListQueryOptions({ range: { kind: 'default' }, status: 'active' }).queryKey.at(-1)).toBe(50);
		expect(runListQueryString({ range: { kind: 'default' }, status: 'active' }, 0, NOW, 200)).toBe(
			'status=active&limit(0,200)',
		);
	});

	it('sends no range for open runs, which the server answers whatever their age', () => {
		expect(runListQueryString({ range: { kind: 'last', hours: 24 }, status: 'active' }, 0, NOW)).toBe(
			'status=active&limit(0,50)',
		);
	});
});

describe('invalidateRunLists', () => {
	it('can leave out the open-run list whose own poll saw the change', async () => {
		const client = new QueryClient();
		const active = activeRunsQueryOptions().queryKey;
		const pastOpen = runListQueryOptions({ range: { kind: 'default' }, status: 'active' }).queryKey;
		const past = runListQueryOptions({ range: { kind: 'default' } }).queryKey;
		client.setQueryData(active, []);
		client.setQueryData(past, []);
		client.setQueryData(pastOpen, []);
		await invalidateRunLists(client, { exceptActive: true });
		expect(client.getQueryState(active)?.isInvalidated).toBe(false);
		expect(client.getQueryState(pastOpen)?.isInvalidated).toBe(true);
		expect(client.getQueryState(past)?.isInvalidated).toBe(true);
	});
});

describe('readers', () => {
	it('lists runs from the collection path with the query string', async () => {
		get.mockResolvedValue({ data: [run('completed'), null, { noId: true }] });
		await expect(getRuns({ range: { kind: 'default' }, verdict: 'down' }, 0)).resolves.toEqual([run('completed')]);
		expect(get).toHaveBeenCalledWith('/Admin/Investigation/?verdict=down&limit(0,50)');
	});

	it('refuses an answer that is not a list', async () => {
		get.mockResolvedValue({ data: { id: 'x' } });
		await expect(getRuns({ range: { kind: 'default' } }, 0)).rejects.toThrow('did not answer with a list of runs');
	});

	it('reads one run by its encoded id and fills absent lists', async () => {
		get.mockResolvedValue({ data: { ...run('running'), evidence: null } });
		const detail = await getRun('arn/1');
		expect(get).toHaveBeenCalledWith('/Admin/Investigation/arn%2F1');
		expect(detail).toMatchObject({ evidence: [], watches: [], blindSpots: [] });
		expect(runPath('a b')).toBe('/Admin/Investigation/a%20b');
	});

	it('normalizes the overview and refuses one without a month', async () => {
		get.mockResolvedValue({ data: { month: '2026-11', agentEnabled: 'yes' } });
		await expect(getAgentOverview()).resolves.toEqual({
			month: '2026-11',
			agentEnabled: false,
			runBudgetUsd: null,
			roles: [],
			settings: [],
		});
		get.mockResolvedValue({ data: [] });
		await expect(getAgentOverview()).rejects.toThrow('agent overview');
	});
});

describe('runDetailQueryOptions polling', () => {
	const interval = (data: unknown) =>
		(runDetailQueryOptions('arn-1').refetchInterval as (query: unknown) => number | false)({
			state: { data, error: null },
		});

	it('stops polling a run the server does not have', () => {
		const refetchInterval = runDetailQueryOptions('arn-x').refetchInterval as (query: unknown) => number | false;
		expect(refetchInterval({ state: { data: undefined, error: { response: { status: 404 } } } })).toBe(false);
	});

	it('re-reads every 5 s until the run is terminal', () => {
		expect(interval(undefined)).toBe(FAST_POLL_MS);
		expect(interval(run('running'))).toBe(FAST_POLL_MS);
		expect(interval(run('completed'))).toBe(false);
		expect(interval(run('cancelled'))).toBe(false);
	});
});

describe('saveAgentSettings', () => {
	it('writes each changed key through the Configuration path after checking it is unchanged', async () => {
		get.mockImplementation(async (url: string) => ({
			data: { name: url, value: url.endsWith('AGENT_ENABLED') ? false : 5 },
		}));
		patch.mockResolvedValue({ data: {} });
		await expect(saveAgentSettings([
			{ name: 'AGENT_ENABLED', value: true, expected: false },
			{ name: 'AGENT_COOLDOWN_MINUTES', value: 10, expected: 5 },
		])).resolves.toEqual(['AGENT_ENABLED', 'AGENT_COOLDOWN_MINUTES']);
		expect(patch.mock.calls).toEqual([
			['/Admin/Configuration/AGENT_ENABLED', { value: true }],
			['/Admin/Configuration/AGENT_COOLDOWN_MINUTES', { value: 10 }],
		]);
	});

	it('stops at the first refusal and reports the keys already saved', async () => {
		get.mockImplementation(async (url: string) => ({ data: { value: url.endsWith('B') ? 'changed' : 1 } }));
		patch.mockResolvedValue({ data: {} });
		const failure = await saveAgentSettings([
			{ name: 'A', value: 2, expected: 1 },
			{ name: 'B', value: 'x', expected: 'y' },
			{ name: 'C', value: 3, expected: 1 },
		]).then(() => {
			throw new Error('expected a refusal');
		}, (error: unknown) => error as Error & { saved: string[] });
		expect(failure.message).toContain('B was changed by someone else');
		expect(failure.saved).toEqual(['A']);
		expect(patch).toHaveBeenCalledTimes(1);
	});
});
