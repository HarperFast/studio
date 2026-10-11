/**
 * @vitest-environment jsdom
 */
import type { Cluster, Instance } from '@/integrations/api/api.patch';
import { RestartUnconfirmedError } from '@/integrations/api/instance/status/restartUnconfirmed';
import { describeUnansweredWrites, OUTCOME_UNKNOWN_TITLE } from '@/integrations/api/unansweredWrite';
import { getRestartState, resetRestartTracker } from '@/lib/restart/restartTracker';
import { act, renderHook } from '@testing-library/react';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ clusterId: 'clu-1' }),
}));
vi.mock('@/config/getInstanceClient', () => ({
	getInstanceClient: vi.fn(({ id }: { id: string }) => ({ target: id })),
}));
vi.mock('@/features/auth/store/authStore', () => ({
	authStore: { checkForFabricConnect: () => false },
}));
vi.mock('@/features/cluster/queries/getClusterInfoQuery', () => ({ getClusterInfo: vi.fn() }));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({ getInstanceUserInfo: vi.fn() }));
vi.mock('@/integrations/api/instance/status/restartInstance', () => ({
	RESTART_MARK_TTL_MS: 600_000,
	restartInstance: vi.fn(),
	waitUntilAnsweringAfterRestart: vi.fn(),
}));
vi.mock('@/lib/sleep', () => ({ sleep: vi.fn(() => Promise.resolve()) }));
vi.mock('sonner', () => ({
	toast: { loading: vi.fn(() => 'toast-1'), error: vi.fn(), success: vi.fn(), dismiss: vi.fn() },
}));

import { getInstanceClient } from '@/config/getInstanceClient';
import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { getInstanceUserInfo } from '@/integrations/api/instance/status/getInstanceUserInfo';
import { restartInstance, waitUntilAnsweringAfterRestart } from '@/integrations/api/instance/status/restartInstance';
import { toast } from 'sonner';
import { useRestartClusterClick } from './useRestartClusterClick';

function instance(id: string, overrides: Partial<Instance> = {}): Instance {
	return {
		id,
		status: 'RUNNING',
		instanceFqdn: `${id}.example.com`,
		operationsApiPort: 9925,
		operationsApiSecure: true,
		...overrides,
	} as Instance;
}

function targetOf(client: AxiosInstance): string {
	return (client as unknown as { target: string }).target;
}

let restarted: string[] = [];

async function clickRestart() {
	const { result } = renderHook(() => useRestartClusterClick());
	await act(async () => {
		await (result.current.onRestartClick() as unknown as Promise<void>);
	});
	return result;
}

beforeEach(() => {
	restarted = [];
	resetRestartTracker();
	vi.mocked(getInstanceUserInfo).mockResolvedValue({} as never);
	vi.mocked(waitUntilAnsweringAfterRestart).mockResolvedValue(undefined);
	vi.mocked(restartInstance).mockImplementation(async ({ instanceClient }) => {
		restarted.push(targetOf(instanceClient));
		return { message: 'ok' };
	});
});

afterEach(() => vi.clearAllMocks());

describe('useRestartClusterClick', () => {
	it('restarts only the RUNNING instances, last first, and reports the one it could not restart', async () => {
		vi.mocked(getClusterInfo).mockResolvedValue(
			{
				id: 'clu-1',
				instances: [instance('ins-a'), instance('ins-b', { status: 'STOPPED' }), instance('ins-c')],
			} as Cluster,
		);

		const result = await clickRestart();

		expect(restarted).toEqual(['ins-c', 'ins-a']);
		expect(result.current.isRestartPending).toBe(false);
		expect(toast.error).toHaveBeenCalledWith(
			'Error',
			expect.objectContaining({ description: expect.stringContaining('Only 2 "RUNNING" instances were restarted') }),
		);
	});

	it('reports success once every instance restarted', async () => {
		vi.mocked(getClusterInfo).mockResolvedValue({ id: 'clu-1', instances: [instance('ins-a')] } as Cluster);

		await clickRestart();

		expect(restarted).toEqual(['ins-a']);
		expect(toast.success).toHaveBeenCalledWith('Success', expect.objectContaining({ id: 'toast-1' }));
		expect(getRestartState('clu-1')).toBeUndefined();
	});

	it('does not restart an instance when Cancel is clicked while it is being checked', async () => {
		vi.mocked(getClusterInfo).mockResolvedValue(
			{ id: 'clu-1', instances: [instance('ins-a'), instance('ins-b')] } as Cluster,
		);
		vi.mocked(getInstanceUserInfo).mockImplementation(async () => {
			cancel();
			return {} as never;
		});

		await clickRestart();

		expect(restartInstance).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledWith('Cancelled', expect.anything());
	});

	it('says the RUNNING instances failed to restart, not that none were RUNNING', async () => {
		vi.mocked(getClusterInfo).mockResolvedValue(
			{ id: 'clu-1', instances: [instance('ins-a'), instance('ins-b')] } as Cluster,
		);
		vi.mocked(restartInstance).mockRejectedValue(new Error('did not come back'));

		await clickRestart();

		const [, options] = vi.mocked(toast.error).mock.calls.at(-1)!;
		expect(options?.description).toContain('Only 0 "RUNNING" instances were restarted of 2 instances.');
		expect(options?.description).not.toContain('No instances were in a "RUNNING" state');
	});

	it('counts a member whose restart got no verdict apart from one that failed', async () => {
		vi.mocked(getClusterInfo).mockResolvedValue(
			{ id: 'clu-1', instances: [instance('ins-a'), instance('ins-b')] } as Cluster,
		);
		vi.mocked(restartInstance).mockImplementation(async ({ instanceClient }) => {
			if (targetOf(instanceClient) === 'ins-b') {
				throw new AxiosError('timeout of 60000ms exceeded', AxiosError.ECONNABORTED, {
					method: 'post',
					data: '{"operation":"restart"}',
				} as InternalAxiosRequestConfig);
			}
			restarted.push(targetOf(instanceClient));
			return { message: 'ok' };
		});

		await clickRestart();

		expect(restarted).toEqual(['ins-a']);
		expect(toast.loading).toHaveBeenCalledWith('Could Not Confirm Instance 1 of 2', expect.anything());
		const [title, options] = vi.mocked(toast.error).mock.calls.at(-1)!;
		expect(title).toBe(OUTCOME_UNKNOWN_TITLE);
		expect(options?.description).toBe(
			'Only 1 "RUNNING" instance was confirmed restarted of 2 instances. '
				+ describeUnansweredWrites(1),
		);
	});

	it('reports a cluster with no instances as a failure, not a success', async () => {
		vi.mocked(getClusterInfo).mockResolvedValue({ id: 'clu-1', instances: [] } as unknown as Cluster);

		await clickRestart();

		expect(toast.success).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledWith(
			'Error',
			expect.objectContaining({ description: expect.stringContaining('No instances were found within the cluster') }),
		);
	});

	describe('when the cluster cannot be loaded', () => {
		it.each([
			['the cluster fetch rejects', () => vi.mocked(getClusterInfo).mockRejectedValue(new Error('503'))],
			['an instance client cannot be built', () => {
				vi.mocked(getClusterInfo).mockResolvedValue({ id: 'clu-1', instances: [instance('ins-a')] } as Cluster);
				vi.mocked(getInstanceClient).mockImplementationOnce(() => {
					throw new TypeError('Invalid URL');
				});
			}],
		])('when %s, it reports it on the restart toast, restarts nothing, and stops pending', async (_label, arrange) => {
			arrange();

			const result = await clickRestart();

			expect(restartInstance).not.toHaveBeenCalled();
			expect(result.current.isRestartPending).toBe(false);
			expect(getRestartState('clu-1')).toBeUndefined();
			expect(toast.success).not.toHaveBeenCalled();
			expect(toast.error).toHaveBeenCalledWith(
				'Error',
				expect.objectContaining({
					id: 'toast-1',
					description: "Could not load the cluster's instances, so nothing was restarted.",
				}),
			);
		});
	});
});

function cancel() {
	const [, options] = vi.mocked(toast.loading).mock.calls.at(-1)!;
	(options as unknown as { action: { onClick: () => void } }).action.onClick();
}

function answeredWith(status: number) {
	const config = { method: 'post', data: { operation: 'restart' } } as never;
	const code = status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST;
	return new AxiosError(`Request failed with status code ${status}`, code, config, undefined, {
		status,
		statusText: '',
		data: status === 504 ? 'Proxied operation timed out after 30s on instance ins-b' : { error: 'Not allowed' },
		headers: {},
		config,
	});
}

function refused() {
	return answeredWith(403);
}

function notBackYet() {
	return new RestartUnconfirmedError(new AxiosError('timeout of 3000ms exceeded', AxiosError.ECONNABORTED));
}

/**
 * Each member's restart outcome, keyed by instance id: an error it rejects with, or a promise it is slow
 * to come back until. A member not listed restarts and comes back. `restarted` records the order.
 */
function restartsEndingIn(outcomes: Record<string, Error | Promise<void>>) {
	vi.mocked(restartInstance).mockImplementation(async ({ instanceClient, onSlowToReturn }) => {
		const target = targetOf(instanceClient);
		restarted.push(target);
		const outcome = outcomes[target];
		if (outcome instanceof RestartUnconfirmedError) {
			onSlowToReturn?.();
		}
		if (outcome instanceof Error) {
			throw outcome;
		}
		if (outcome) {
			onSlowToReturn?.();
			await outcome;
		}
		return { message: 'Restarting Harper. This may take up to 60 seconds.' };
	});
}

function finalError() {
	const [title, options] = vi.mocked(toast.error).mock.calls.at(-1) ?? [];
	return { title, description: (options as { description?: string } | undefined)?.description };
}

describe('useRestartClusterClick, for a member whose restart got no answer', () => {
	beforeEach(() => {
		vi.mocked(getClusterInfo).mockResolvedValue(
			{ id: 'clu-1', instances: [instance('ins-a'), instance('ins-b'), instance('ins-c')] } as Cluster,
		);
	});

	it('holds it down, and waits for it to answer, before restarting the next member', async () => {
		let answer: (() => void) | undefined;
		vi.mocked(waitUntilAnsweringAfterRestart).mockReturnValueOnce(new Promise<void>((resolve) => (answer = resolve)));
		// Last member first: ins-c restarts, then ins-b's restart gets a 504.
		restartsEndingIn({ 'ins-b': answeredWith(504) });
		const { result } = renderHook(() => useRestartClusterClick());

		let click: Promise<void> | undefined;
		act(() => {
			click = result.current.onRestartClick() as unknown as Promise<void>;
		});
		await vi.waitFor(() => expect(waitUntilAnsweringAfterRestart).toHaveBeenCalledTimes(1));

		expect(targetOf(vi.mocked(waitUntilAnsweringAfterRestart).mock.calls[0][0].instanceClient)).toBe('ins-b');
		expect(restarted).toEqual(['ins-c', 'ins-b']);
		expect(getRestartState('ins-b')?.reach).toBe('down');

		await act(async () => {
			answer!();
			await click;
		});

		expect(restarted).toEqual(['ins-c', 'ins-b', 'ins-a']);
		expect(getRestartState('ins-b')).toBeUndefined();
		expect(vi.mocked(toast.error).mock.calls.at(-1)?.[0]).toBe(OUTCOME_UNKNOWN_TITLE);
	});

	it('does not wait on a member that refused the restart', async () => {
		restartsEndingIn({ 'ins-b': answeredWith(403) });

		await clickRestart();

		expect(restarted).toEqual(['ins-c', 'ins-b', 'ins-a']);
		expect(waitUntilAnsweringAfterRestart).not.toHaveBeenCalled();
		expect(vi.mocked(toast.error).mock.calls.at(-1)?.[0]).toBe('Error');
	});
});

describe('useRestartClusterClick, for a member that accepted the restart but has not answered since', () => {
	beforeEach(() => {
		vi.mocked(getClusterInfo).mockResolvedValue(
			{ id: 'clu-1', instances: [instance('ins-a'), instance('ins-b'), instance('ins-c')] } as Cluster,
		);
	});

	it('stops there rather than restart another member, and never says the cluster failed', async () => {
		// Last member first: ins-c restarts, ins-b accepts and never comes back, ins-a is left alone.
		restartsEndingIn({ 'ins-b': notBackYet() });

		await clickRestart();

		expect(restarted).toEqual(['ins-c', 'ins-b']);
		expect(toast.loading).toHaveBeenCalledWith(
			'Waiting On Instance 2 of 3',
			expect.objectContaining({ description: "It accepted the restart but hasn't answered yet." }),
		);
		expect(finalError()).toEqual({
			title: 'Not back yet',
			description: 'Only 1 "RUNNING" instance was confirmed restarted of 3 instances. '
				+ "1 instance accepted the restart but hasn't answered since, so it may still be starting. "
				+ '1 other instance was not restarted, to keep the cluster available. '
				+ 'Check its status before you restart it again.',
		});
		expect(toast.success).not.toHaveBeenCalled();
		expect(getRestartState('ins-b')).toBeUndefined();
		expect(getRestartState('clu-1')).toBeUndefined();
	});

	it('names no members left alone when the last one is the one not back', async () => {
		restartsEndingIn({ 'ins-a': notBackYet() });

		await clickRestart();

		expect(restarted).toEqual(['ins-c', 'ins-b', 'ins-a']);
		expect(finalError().description).toBe(
			'Only 2 "RUNNING" instances were confirmed restarted of 3 instances. '
				+ "1 instance accepted the restart but hasn't answered since, so it may still be starting. "
				+ 'Check its status before you restart it again.',
		);
	});

	it('goes on to the next member once a slow one answers, holding it down until then', async () => {
		let answer: (() => void) | undefined;
		restartsEndingIn({ 'ins-b': new Promise<void>((resolve) => (answer = resolve)) });
		const { result } = renderHook(() => useRestartClusterClick());

		let click: Promise<void> | undefined;
		act(() => {
			click = result.current.onRestartClick() as unknown as Promise<void>;
		});
		await vi.waitFor(() => expect(restarted).toEqual(['ins-c', 'ins-b']));

		expect(getRestartState('ins-b')?.reach).toBe('down');

		await act(async () => {
			answer!();
			await click;
		});

		expect(restarted).toEqual(['ins-c', 'ins-b', 'ins-a']);
		expect(toast.success).toHaveBeenCalledWith('Success', expect.objectContaining({ id: 'toast-1' }));
		expect(getRestartState('ins-b')).toBeUndefined();
	});

	it('still carries on past a member that refused, and says it failed', async () => {
		restartsEndingIn({ 'ins-b': refused() });

		await clickRestart();

		expect(restarted).toEqual(['ins-c', 'ins-b', 'ins-a']);
		expect(toast.loading).toHaveBeenCalledWith('Failed Restarting Instance 2 of 3', expect.anything());
		expect(finalError().title).toBe('Error');
		expect(finalError().description).toContain('Only 2 "RUNNING" instances were restarted');
	});

	it('names a member that refused alongside the one not back', async () => {
		restartsEndingIn({ 'ins-c': refused(), 'ins-b': notBackYet() });

		await clickRestart();

		expect(restarted).toEqual(['ins-c', 'ins-b']);
		expect(finalError()).toEqual({
			title: 'Not back yet',
			description: 'Only 0 "RUNNING" instances were confirmed restarted of 3 instances. '
				+ '1 instance failed to restart. '
				+ "1 instance accepted the restart but hasn't answered since, so it may still be starting. "
				+ '1 other instance was not restarted, to keep the cluster available. '
				+ 'Check its status before you restart it again.',
		});
	});

	it('still says it is not back yet when Cancel is clicked while waiting on it', async () => {
		vi.mocked(restartInstance).mockImplementation(async ({ instanceClient, onSlowToReturn }) => {
			restarted.push(targetOf(instanceClient));
			if (targetOf(instanceClient) === 'ins-b') {
				onSlowToReturn?.();
				cancel();
				throw notBackYet();
			}
			return { message: 'Restarting Harper. This may take up to 60 seconds.' };
		});

		await clickRestart();

		expect(restarted).toEqual(['ins-c', 'ins-b']);
		expect(finalError().title).toBe('Not back yet');
		expect(vi.mocked(toast.error).mock.calls.map(([title]) => title)).not.toContain('Cancelled');
	});

	it('still says Cancelled when nothing was left uncertain', async () => {
		vi.mocked(restartInstance).mockImplementation(async ({ instanceClient }) => {
			restarted.push(targetOf(instanceClient));
			cancel();
			return { message: 'Restarting Harper. This may take up to 60 seconds.' };
		});

		await clickRestart();

		expect(restarted).toEqual(['ins-c']);
		expect(finalError().title).toBe('Cancelled');
	});
});
