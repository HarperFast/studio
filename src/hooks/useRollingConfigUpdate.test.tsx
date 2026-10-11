/**
 * @vitest-environment jsdom
 */
import type { Cluster, Instance } from '@/integrations/api/api.patch';
import { RestartUnconfirmedError } from '@/integrations/api/instance/status/restartUnconfirmed';
import { describeUnansweredWrites, OUTCOME_UNKNOWN_TITLE } from '@/integrations/api/unansweredWrite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeClient {
	target: string;
}

const { operationsParams } = vi.hoisted(() => ({
	operationsParams: {
		current: {
			entityType: 'cluster' as 'cluster' | 'instance',
			entityId: 'clu-1',
			instanceClient: { target: 'cluster-load-balancer' } as unknown,
		},
	},
}));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => operationsParams.current,
}));
vi.mock('@/config/getInstanceClient', () => ({
	getInstanceClient: ({ id }: { id: string }) => ({ target: id }),
}));
vi.mock('@/features/auth/store/authStore', () => ({
	authStore: { checkForFabricConnect: () => false },
}));
vi.mock('@/features/cluster/queries/getClusterInfoQuery', () => ({ getClusterInfo: vi.fn() }));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({ getInstanceUserInfo: vi.fn() }));
vi.mock('@/integrations/api/instance/status/restartInstance', () => ({ restartInstance: vi.fn() }));
vi.mock('@/integrations/api/instance/status/setConfiguration', async (importOriginal) => ({
	...await importOriginal<typeof import('@/integrations/api/instance/status/setConfiguration')>(),
	setConfiguration: vi.fn(),
}));
vi.mock('@/lib/sleep', () => ({ sleep: vi.fn(() => Promise.resolve()) }));
vi.mock('sonner', () => ({
	toast: { loading: vi.fn(() => 'toast-1'), error: vi.fn(), success: vi.fn(), dismiss: vi.fn() },
}));

import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { getInstanceUserInfo } from '@/integrations/api/instance/status/getInstanceUserInfo';
import { restartInstance } from '@/integrations/api/instance/status/restartInstance';
import { setConfiguration } from '@/integrations/api/instance/status/setConfiguration';
import { toast } from 'sonner';
import { useRollingConfigUpdate } from './useRollingConfigUpdate';

const CHANGES = { logging_level: 'debug' };

function instance(id: string, version: string | undefined, overrides: Partial<Instance> = {}): Instance {
	return {
		id,
		version,
		status: 'RUNNING',
		instanceFqdn: `${id}.example.com`,
		replicationFqdn: `${id}-repl.example.com`,
		operationsApiPort: 9925,
		operationsApiSecure: true,
		...overrides,
	} as Instance;
}

function useCluster(instances: Instance[]) {
	vi.mocked(getClusterInfo).mockResolvedValue({ id: 'clu-1', instances } as Cluster);
}

let events: string[] = [];

function targetOf(client: AxiosInstance): string {
	return (client as unknown as FakeClient).target;
}

const CONFIGURED = 'Configuration successfully set. You must restart Harper for new config settings to take effect.';

/** The shape harper-pro's `replicateOperation` returns: each peer's own answer with its node name attached. */
function acknowledging(...nodes: string[]) {
	return {
		message: CONFIGURED,
		replicated: nodes.map((node, requestId) => ({ message: CONFIGURED, requestId, node })),
	};
}

function wrapper() {
	const queryClient = new QueryClient();
	return ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}
	</QueryClientProvider>;
}

async function save() {
	const { result } = renderHook(() => useRollingConfigUpdate(), { wrapper: wrapper() });
	await act(async () => {
		await (result.current.onConfigUpdate(CHANGES) as unknown as Promise<void>);
	});
	return result;
}

beforeEach(() => {
	events = [];
	operationsParams.current = {
		entityType: 'cluster',
		entityId: 'clu-1',
		instanceClient: { target: 'cluster-load-balancer' },
	};
	vi.mocked(getInstanceUserInfo).mockImplementation(async ({ instanceClient }) => {
		events.push(`check ${targetOf(instanceClient)}`);
		return {} as never;
	});
	vi.mocked(setConfiguration).mockImplementation(async ({ instanceClient, ...changes }) => {
		events.push(`${changes.replicated ? 'replicate' : 'write'} ${targetOf(instanceClient)}`);
		return { message: 'ok' };
	});
	vi.mocked(restartInstance).mockImplementation(async ({ instanceClient }) => {
		events.push(`restart ${targetOf(instanceClient)}`);
		return { message: 'ok' };
	});
});

afterEach(() => vi.clearAllMocks());

describe('useRollingConfigUpdate on a cluster that replicates set_configuration (5.2+)', () => {
	it('writes and restarts one instance, fans the write out from it, then only restarts the acknowledged rest', async () => {
		useCluster([instance('ins-a', '5.2.13'), instance('ins-b', '5.3.0'), instance('ins-c', '5.2.0')]);
		vi.mocked(setConfiguration).mockImplementation(async ({ instanceClient, ...changes }) => {
			events.push(`${changes.replicated ? 'replicate' : 'write'} ${targetOf(instanceClient)}`);
			// Node names are compared case-insensitively.
			return changes.replicated ? acknowledging('INS-B-REPL.example.com', 'ins-a-repl.example.com') : { message: 'ok' };
		});

		await save();

		expect(events).toEqual([
			'check ins-c',
			'write ins-c',
			'restart ins-c',
			'replicate ins-c',
			'check ins-b',
			'restart ins-b',
			'check ins-a',
			'restart ins-a',
		]);
		expect(setConfiguration).toHaveBeenCalledWith(expect.objectContaining({ ...CHANGES, replicated: true }));
		expect(toast.success).toHaveBeenCalled();
	});

	it('never starts the next restart before the previous one has finished', async () => {
		useCluster([instance('ins-a', '5.2.0'), instance('ins-b', '5.2.0'), instance('ins-c', '5.2.0')]);
		vi.mocked(setConfiguration).mockImplementation(async ({ instanceClient, ...changes }) => {
			events.push(`${changes.replicated ? 'replicate' : 'write'} ${targetOf(instanceClient)}`);
			return changes.replicated ? acknowledging('ins-a-repl.example.com', 'ins-b-repl.example.com') : { message: 'ok' };
		});
		let inFlight = 0;
		let maxInFlight = 0;
		const pending: Array<() => void> = [];
		vi.mocked(restartInstance).mockImplementation(({ instanceClient }) => {
			events.push(`restart ${targetOf(instanceClient)}`);
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			return new Promise(resolve =>
				pending.push(() => {
					inFlight -= 1;
					resolve({ message: 'ok' });
				})
			);
		});
		const { result } = renderHook(() => useRollingConfigUpdate(), { wrapper: wrapper() });

		let done: Promise<void> | undefined;
		act(() => {
			done = result.current.onConfigUpdate(CHANGES) as unknown as Promise<void>;
		});
		for (const expected of ['ins-c', 'ins-b', 'ins-a']) {
			await vi.waitFor(() => expect(pending).toHaveLength(1));
			expect(events.at(-1)).toBe(`restart ${expected}`);
			await act(async () => pending.shift()!());
		}
		await act(async () => done);

		expect(maxInFlight).toBe(1);
		expect(toast.success).toHaveBeenCalled();
	});

	it('keeps the local write for a target replication did not acknowledge, whatever the count', async () => {
		useCluster([instance('ins-a', '5.2.0'), instance('ins-b', '5.2.0'), instance('ins-c', '5.2.0')]);
		vi.mocked(setConfiguration).mockImplementation(async ({ instanceClient, ...changes }) => {
			events.push(`${changes.replicated ? 'replicate' : 'write'} ${targetOf(instanceClient)}`);
			// Two acknowledgements for two remaining targets — but one is a peer Studio is not restarting.
			return changes.replicated ? acknowledging('ins-b-repl.example.com', 'stale-peer.example.com') : { message: 'ok' };
		});

		await save();

		expect(events).toEqual([
			'check ins-c',
			'write ins-c',
			'restart ins-c',
			'replicate ins-c',
			'check ins-b',
			'restart ins-b',
			'check ins-a',
			'write ins-a',
			'restart ins-a',
		]);
	});

	it('keeps the local write for a target whose replication name is unknown', async () => {
		useCluster([
			instance('ins-a', '5.2.0', { replicationFqdn: undefined }),
			instance('ins-b', '5.2.0'),
		]);
		vi.mocked(setConfiguration).mockImplementation(async ({ instanceClient, ...changes }) => {
			events.push(`${changes.replicated ? 'replicate' : 'write'} ${targetOf(instanceClient)}`);
			return changes.replicated ? acknowledging('ins-a-repl.example.com') : { message: 'ok' };
		});

		await save();

		expect(events).toEqual([
			'check ins-b',
			'write ins-b',
			'restart ins-b',
			'replicate ins-b',
			'check ins-a',
			'write ins-a',
			'restart ins-a',
		]);
	});

	it('falls back to writing every remaining instance when the fan-out is rejected, still counting the canary', async () => {
		useCluster([instance('ins-a', '5.2.0'), instance('ins-b', '5.2.0'), instance('ins-c', '5.2.0')]);
		vi.mocked(setConfiguration).mockImplementation(async ({ instanceClient, ...changes }) => {
			events.push(`${changes.replicated ? 'replicate' : 'write'} ${targetOf(instanceClient)}`);
			if (changes.replicated) {
				// What `rejectReplicationFailures` turns a partial fan-out into.
				throw 'The operation partially succeeded, but 1 node failed:\nins-a-repl.example.com: timeout';
			}
			return { message: 'ok' };
		});

		await save();

		expect(events).toEqual([
			'check ins-c',
			'write ins-c',
			'restart ins-c',
			'replicate ins-c',
			'check ins-b',
			'write ins-b',
			'restart ins-b',
			'check ins-a',
			'write ins-a',
			'restart ins-a',
		]);
		expect(toast.success).toHaveBeenCalled();
		expect(toast.error).not.toHaveBeenCalled();
		expect(toast.loading).not.toHaveBeenCalledWith(expect.stringContaining('Failed'), expect.anything());
	});

	it('falls back to writing every remaining instance when the response names no peers', async () => {
		useCluster([instance('ins-a', '5.2.0'), instance('ins-b', '5.2.0')]);

		await save();

		expect(events).toEqual([
			'check ins-b',
			'write ins-b',
			'restart ins-b',
			'replicate ins-b',
			'check ins-a',
			'write ins-a',
			'restart ins-a',
		]);
	});

	it('waits to fan out until an instance has actually come back on the new configuration', async () => {
		useCluster([instance('ins-a', '5.2.0'), instance('ins-b', '5.2.0'), instance('ins-c', '5.2.0')]);
		vi.mocked(restartInstance).mockImplementation(async ({ instanceClient }) => {
			events.push(`restart ${targetOf(instanceClient)}`);
			if (targetOf(instanceClient) === 'ins-c') {
				throw new Error('did not come back');
			}
			return { message: 'ok' };
		});
		vi.mocked(setConfiguration).mockImplementation(async ({ instanceClient, ...changes }) => {
			events.push(`${changes.replicated ? 'replicate' : 'write'} ${targetOf(instanceClient)}`);
			return changes.replicated ? acknowledging('ins-a-repl.example.com', 'ins-c-repl.example.com') : { message: 'ok' };
		});

		await save();

		expect(events).toEqual([
			'check ins-c',
			'write ins-c',
			'restart ins-c',
			'check ins-b',
			'write ins-b',
			'restart ins-b',
			'replicate ins-b',
			'check ins-a',
			'restart ins-a',
		]);
		expect(toast.error).toHaveBeenCalledWith(
			'Error',
			expect.objectContaining({ description: expect.stringContaining('may already have the new configuration saved') }),
		);
	});

	it('fans out after the last restart too, so live members Studio does not restart still get the write', async () => {
		useCluster([instance('ins-a', '5.2.0'), instance('ins-b', '5.2.0', { status: 'STOPPED' })]);

		await save();

		expect(events).toEqual(['check ins-a', 'write ins-a', 'restart ins-a', 'replicate ins-a']);
		expect(toast.error).toHaveBeenCalledWith(
			'Error',
			expect.objectContaining({ description: expect.stringContaining('may already have the new configuration saved') }),
		);
	});

	it('does not fan out on a cluster with no other live member', async () => {
		useCluster([instance('ins-a', '5.2.0'), instance('ins-b', '5.2.0', { status: 'TERMINATED' })]);

		await save();

		expect(events).toEqual(['check ins-a', 'write ins-a', 'restart ins-a']);
	});

	it('says configuration may be pending when cancelled after a fan-out', async () => {
		useCluster([instance('ins-a', '5.2.0'), instance('ins-b', '5.2.0'), instance('ins-c', '5.2.0')]);
		vi.mocked(setConfiguration).mockImplementation(async ({ instanceClient, ...changes }) => {
			events.push(`${changes.replicated ? 'replicate' : 'write'} ${targetOf(instanceClient)}`);
			if (changes.replicated) {
				cancel();
				return acknowledging('ins-a-repl.example.com', 'ins-b-repl.example.com');
			}
			return { message: 'ok' };
		});

		await save();

		expect(events).toEqual(['check ins-c', 'write ins-c', 'restart ins-c', 'replicate ins-c']);
		expect(toast.error).toHaveBeenCalledWith(
			'Cancelled',
			expect.objectContaining({ description: expect.stringContaining('may already have the new configuration saved') }),
		);
	});

	it('does not fan out once cancelled, and keeps the plain cancellation copy', async () => {
		useCluster([instance('ins-a', '5.2.0'), instance('ins-b', '5.2.0')]);
		vi.mocked(restartInstance).mockImplementation(async ({ instanceClient }) => {
			events.push(`restart ${targetOf(instanceClient)}`);
			cancel();
			return { message: 'ok' };
		});

		await save();

		expect(events).toEqual(['check ins-b', 'write ins-b', 'restart ins-b']);
		expect(toast.error).toHaveBeenCalledWith(
			'Cancelled',
			expect.objectContaining({ description: 'The config update was partially cancelled.' }),
		);
	});
});

describe('useRollingConfigUpdate on clusters that must not replicate', () => {
	it.each([
		['a mixed-version cluster', ['5.2.13', '5.1.20', '5.2.13']],
		['an instance with no reported version', ['5.2.13', undefined, '5.2.13']],
		['a 5.2.0 prerelease', ['5.2.0-beta.1', '5.2.0', '5.2.0']],
		['a pre-5.2 cluster', ['5.1.29', '5.1.29', '5.1.29']],
	])('writes every instance locally on %s', async (_label, versions) => {
		useCluster(versions.map((version, index) => instance(`ins-${index}`, version)));

		await save();

		expect(vi.mocked(setConfiguration).mock.calls.some(([body]) => 'replicated' in body)).toBe(false);
		expect(events).toEqual([
			'check ins-2',
			'write ins-2',
			'restart ins-2',
			'check ins-1',
			'write ins-1',
			'restart ins-1',
			'check ins-0',
			'write ins-0',
			'restart ins-0',
		]);
	});

	it('writes the single instance a per-instance view targets', async () => {
		operationsParams.current = {
			entityType: 'instance',
			entityId: 'ins-a',
			instanceClient: { target: 'ins-a-direct' },
		};

		await save();

		expect(getClusterInfo).not.toHaveBeenCalled();
		expect(events).toEqual(['check ins-a-direct', 'write ins-a-direct', 'restart ins-a-direct']);
	});
});

describe('useRollingConfigUpdate outcome reporting', () => {
	it('reports a cluster with no instances as a failure, not a success', async () => {
		useCluster([]);

		await save();

		expect(toast.success).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledWith(
			'Error',
			expect.objectContaining({ description: expect.stringContaining('No instances were found within the cluster') }),
		);
	});

	it('does not mention pending configuration when nothing was fanned out', async () => {
		useCluster([instance('ins-a', '5.1.29'), instance('ins-b', '5.1.29')]);
		vi.mocked(restartInstance).mockImplementation(async ({ instanceClient }) => {
			events.push(`restart ${targetOf(instanceClient)}`);
			if (targetOf(instanceClient) === 'ins-b') {
				throw new Error('did not come back');
			}
			return { message: 'ok' };
		});

		await save();

		const [, options] = vi.mocked(toast.error).mock.calls.at(-1)!;
		expect(options?.description).toContain('Only 1 "RUNNING" instance was restarted of 2 instances.');
		expect(options?.description).not.toContain('may already have the new configuration saved');
	});

	it('says the RUNNING instances failed to restart, not that none were RUNNING', async () => {
		useCluster([instance('ins-a', '5.1.29'), instance('ins-b', '5.1.29')]);
		vi.mocked(restartInstance).mockRejectedValue(new Error('did not come back'));

		await save();

		const [, options] = vi.mocked(toast.error).mock.calls.at(-1)!;
		expect(options?.description).toContain('Only 0 "RUNNING" instances were restarted of 2 instances.');
		expect(options?.description).not.toContain('No instances were in a "RUNNING" state');
	});

	it('counts a member whose restart got no verdict apart from one that failed', async () => {
		useCluster([instance('ins-a', '5.1.29'), instance('ins-b', '5.1.29')]);
		vi.mocked(restartInstance).mockImplementation(async ({ instanceClient }) => {
			if (targetOf(instanceClient) === 'ins-b') {
				throw new AxiosError('timeout of 60000ms exceeded', AxiosError.ECONNABORTED, {
					method: 'post',
					data: '{"operation":"restart_service"}',
				} as InternalAxiosRequestConfig);
			}
			return { message: 'ok' };
		});

		await save();

		expect(toast.loading).toHaveBeenCalledWith('Could Not Confirm Instance 1 of 2', expect.anything());
		const [title, options] = vi.mocked(toast.error).mock.calls.at(-1)!;
		expect(title).toBe(OUTCOME_UNKNOWN_TITLE);
		expect(options?.description).toBe(
			'Only 1 "RUNNING" instance was confirmed updated of 2 instances. '
				+ describeUnansweredWrites(1),
		);
	});
});

describe('useRollingConfigUpdate cancellation', () => {
	it('does not write or restart an instance when Cancel is clicked while it is being checked', async () => {
		useCluster([instance('ins-a', '5.1.29'), instance('ins-b', '5.1.29')]);
		vi.mocked(getInstanceUserInfo).mockImplementation(async ({ instanceClient }) => {
			events.push(`check ${targetOf(instanceClient)}`);
			cancel();
			return {} as never;
		});

		await save();

		expect(events).toEqual(['check ins-b']);
		expect(toast.error).toHaveBeenCalledWith(
			'Cancelled',
			expect.objectContaining({ description: 'The config update was partially cancelled.' }),
		);
	});
});

describe('useRollingConfigUpdate when the cluster cannot be loaded', () => {
	it('reports it, changes nothing, and stops pending', async () => {
		vi.mocked(getClusterInfo).mockRejectedValue(new Error('503'));

		const result = await save();

		expect(events).toEqual([]);
		expect(result.current.isPending).toBe(false);
		expect(toast.error).toHaveBeenCalledWith(
			'Error',
			expect.objectContaining({ description: expect.stringContaining('no configuration was changed') }),
		);
	});
});

function cancel() {
	const [, options] = vi.mocked(toast.loading).mock.calls.at(-1)!;
	(options as unknown as { action: { onClick: () => void } }).action.onClick();
}

/**
 * Restarts record `restart <target>` as usual; the targets listed accept the restart but are never
 * confirmed back, after saying once that they are slow.
 */
function notBackAfterRestart(...targets: string[]) {
	vi.mocked(restartInstance).mockImplementation(async ({ instanceClient, onSlowToReturn }) => {
		events.push(`restart ${targetOf(instanceClient)}`);
		if (targets.includes(targetOf(instanceClient))) {
			onSlowToReturn?.();
			throw new RestartUnconfirmedError(new AxiosError('Network Error', AxiosError.ERR_NETWORK));
		}
		return { message: 'Restarting http' };
	});
}

function finalError() {
	const [title, options] = vi.mocked(toast.error).mock.calls.at(-1) ?? [];
	return { title, description: (options as { description?: string } | undefined)?.description };
}

describe('useRollingConfigUpdate, for a member that accepted the restart but has not answered since', () => {
	it('stops there rather than update another member, and never says the update failed', async () => {
		useCluster([instance('ins-a', '5.1.29'), instance('ins-b', '5.1.29')]);
		notBackAfterRestart('ins-b');

		await save();

		// Last member first: ins-b took the config and never came back, so ins-a was not touched.
		expect(events).toEqual(['check ins-b', 'write ins-b', 'restart ins-b']);
		expect(toast.loading).toHaveBeenCalledWith(
			'Waiting On Instance 1 of 2',
			expect.objectContaining({ description: "It accepted the restart but hasn't answered yet." }),
		);
		expect(finalError()).toEqual({
			title: 'Not back yet',
			description: 'Only 0 "RUNNING" instances were confirmed updated of 2 instances. '
				+ "1 instance accepted the restart but hasn't answered since, so it may still be starting. "
				+ '1 other instance was not updated, to keep the cluster available. '
				+ 'Check its status before you restart it again.',
		});
		expect(toast.success).not.toHaveBeenCalled();
	});

	it('still carries on past a member that refused the update, and says it failed', async () => {
		useCluster([instance('ins-a', '5.1.29'), instance('ins-b', '5.1.29')]);
		vi.mocked(setConfiguration).mockImplementation(async ({ instanceClient }) => {
			events.push(`write ${targetOf(instanceClient)}`);
			if (targetOf(instanceClient) === 'ins-b') {
				throw new Error('Invalid configuration');
			}
			return { message: 'ok' };
		});

		await save();

		expect(events).toEqual(['check ins-b', 'write ins-b', 'check ins-a', 'write ins-a', 'restart ins-a']);
		expect(finalError().title).toBe('Error');
		expect(finalError().description).toContain('Failed to fully update cluster.');
	});

	it('never fans the configuration out from a canary that is not back', async () => {
		useCluster([instance('ins-a', '5.2.0'), instance('ins-b', '5.2.0'), instance('ins-c', '5.2.0')]);
		notBackAfterRestart('ins-c');

		await save();

		expect(events).toEqual(['check ins-c', 'write ins-c', 'restart ins-c']);
		expect(finalError().title).toBe('Not back yet');
		expect(finalError().description).not.toContain('may already have the new configuration saved');
	});

	it('stops at a later member that is not back, and says the members it left may have the new configuration', async () => {
		useCluster([instance('ins-a', '5.2.0'), instance('ins-b', '5.2.0'), instance('ins-c', '5.2.0')]);
		vi.mocked(setConfiguration).mockImplementation(async ({ instanceClient, ...changes }) => {
			events.push(`${changes.replicated ? 'replicate' : 'write'} ${targetOf(instanceClient)}`);
			return changes.replicated ? acknowledging('ins-a-repl.example.com', 'ins-b-repl.example.com') : { message: 'ok' };
		});
		notBackAfterRestart('ins-b');

		await save();

		expect(events).toEqual([
			'check ins-c',
			'write ins-c',
			'restart ins-c',
			'replicate ins-c',
			'check ins-b',
			'restart ins-b',
		]);
		expect(finalError()).toEqual({
			title: 'Not back yet',
			description: 'Only 1 "RUNNING" instance was confirmed updated of 3 instances. '
				+ "1 instance accepted the restart but hasn't answered since, so it may still be starting. "
				+ '1 other instance was not updated, to keep the cluster available. '
				+ 'Check its status before you restart it again.\n'
				+ 'Instances that were not restarted may already have the new configuration saved, and will apply it '
				+ 'the next time they restart.',
		});
	});
});
