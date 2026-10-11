/**
 * @vitest-environment jsdom
 */
import type { Cluster, Instance } from '@/integrations/api/api.patch';
import { getRestartState } from '@/lib/restart/restartTracker';
import { act, renderHook } from '@testing-library/react';
import type { AxiosInstance } from 'axios';
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
vi.mock('@/integrations/api/instance/status/restartInstance', () => ({ restartInstance: vi.fn() }));
vi.mock('@/lib/sleep', () => ({ sleep: vi.fn(() => Promise.resolve()) }));
vi.mock('sonner', () => ({
	toast: { loading: vi.fn(() => 'toast-1'), error: vi.fn(), success: vi.fn(), dismiss: vi.fn() },
}));

import { getInstanceClient } from '@/config/getInstanceClient';
import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { getInstanceUserInfo } from '@/integrations/api/instance/status/getInstanceUserInfo';
import { restartInstance } from '@/integrations/api/instance/status/restartInstance';
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
	vi.mocked(getInstanceUserInfo).mockResolvedValue({} as never);
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
