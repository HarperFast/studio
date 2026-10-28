import type { Cluster, Instance } from '@/integrations/api/api.patch';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { fabricConnect } = vi.hoisted(() => ({ fabricConnect: { current: false } }));
vi.mock('@/config/getInstanceClient', () => ({
	getInstanceClient: vi.fn((config: unknown) => ({ config })),
}));
vi.mock('@/features/auth/store/authStore', () => ({
	authStore: { checkForFabricConnect: vi.fn(() => fabricConnect.current) },
}));
vi.mock('@/features/cluster/queries/getClusterInfoQuery', () => ({ getClusterInfo: vi.fn() }));

import { getInstanceClient } from '@/config/getInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { getClusterRestartTargets } from './getClusterRestartTargets';

function instance(id: string, status: Instance['status'] = 'RUNNING'): Instance {
	return {
		id,
		status,
		instanceFqdn: `${id}.example.com`,
		operationsApiPort: 9925,
		operationsApiSecure: true,
	} as Instance;
}

afterEach(() => {
	fabricConnect.current = false;
	vi.clearAllMocks();
});

describe('getClusterRestartTargets', () => {
	it('builds a client for each RUNNING instance, last instance first, and keeps every instance', async () => {
		const instances = [instance('ins-a'), instance('ins-b', 'STOPPED'), instance('ins-c')];
		vi.mocked(getClusterInfo).mockResolvedValue({ id: 'clu-1', instances } as Cluster);

		const { allInstances, targets } = await getClusterRestartTargets('clu-1');

		expect(getClusterInfo).toHaveBeenCalledWith('clu-1');
		expect(allInstances).toBe(instances);
		expect(targets.map(({ instance }) => instance.id)).toEqual(['ins-c', 'ins-a']);
		expect(targets[0].instanceClient).toEqual({
			config: { id: 'ins-c', forceFabricConnect: false, operationsUrl: 'https://ins-c.example.com:9925/' },
		});
	});

	it('builds no client for a RUNNING instance without an address, but still counts it', async () => {
		const addressless = { ...instance('ins-b'), instanceFqdn: undefined };
		const instances = [instance('ins-a'), addressless];
		vi.mocked(getClusterInfo).mockResolvedValue({ id: 'clu-1', instances } as Cluster);

		const { allInstances, targets } = await getClusterRestartTargets('clu-1');

		expect(allInstances).toBe(instances);
		expect(targets.map(({ instance }) => instance.id)).toEqual(['ins-a']);
		expect(getInstanceClient).toHaveBeenCalledTimes(1);
	});

	it("forwards the cluster's Fabric Connect mode to every client", async () => {
		fabricConnect.current = true;
		vi.mocked(getClusterInfo).mockResolvedValue({ id: 'clu-1', instances: [instance('ins-a')] } as Cluster);

		await getClusterRestartTargets('clu-1');

		expect(authStore.checkForFabricConnect).toHaveBeenCalledWith('clu-1');
		expect(getInstanceClient).toHaveBeenCalledWith(expect.objectContaining({ forceFabricConnect: true }));
	});

	it('treats a cluster without an instance list as empty', async () => {
		vi.mocked(getClusterInfo).mockResolvedValue({ id: 'clu-1' } as Cluster);

		expect(await getClusterRestartTargets('clu-1')).toEqual({ allInstances: [], targets: [] });
	});

	it('rejects when the cluster cannot be fetched, so callers can report it', async () => {
		vi.mocked(getClusterInfo).mockRejectedValue(new Error('503'));

		await expect(getClusterRestartTargets('clu-1')).rejects.toThrow('503');
		expect(getInstanceClient).not.toHaveBeenCalled();
	});
});
