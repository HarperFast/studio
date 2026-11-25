/** @vitest-environment jsdom */
import type { Instance, LocalUser } from '@/integrations/api/api.patch';
import { isCancelledError, type QueryKey } from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Imported after jsdom localStorage exists — the store snapshots it in its constructor.
const { authStore } = await import('@/features/auth/store/authStore');
const { signOutOfInstance } = await import('@/features/cluster/signOutOfInstance');
const { queryClient } = await import('@/react-query/queryClient');
const { getClusterInfoQueryOptions } = await import('@/features/cluster/queries/getClusterInfoQuery');
const { getInstanceInfoQueryOptions } = await import('@/features/cluster/queries/getInstanceInfoQuery');

const user = { username: 'admin' } as LocalUser;

const cached = (queryKey: QueryKey) => queryClient.getQueryCache().find({ queryKey, exact: true }) !== undefined;

function makeInstance(id: string, fqdn: string): Instance {
	return {
		id,
		clusterId: 'clu-1',
		instanceFqdn: fqdn,
		operationsApiPort: 9925,
		operationsApiSecure: true,
	} as Instance;
}

function makeClient(): AxiosInstance {
	return { post: vi.fn().mockResolvedValue({ data: { message: 'logged out' } }) } as unknown as AxiosInstance;
}

describe('signOutOfInstance', () => {
	afterEach(() => {
		// Reset the singleton store's state between tests.
		for (const id of ['ins-a', 'ins-b', 'clu-1']) {
			authStore.signOutLocally(id);
		}
		localStorage.clear();
		queryClient.clear();
	});

	it("drops what was read through the instance's and the cluster's sign-in, and nothing else (#1993)", async () => {
		const dropped: QueryKey[] = [['ins-a', 'get_components'], ['get_status', 'ins-a'], ['clu-1', 'describe_all']];
		const kept: QueryKey[] = [['ins-b', 'get_components'], ['get_status', 'ins-b']];
		for (const queryKey of [...dropped, ...kept]) {
			queryClient.setQueryData(queryKey, { read: 'before the sign-out' });
		}
		// Central manager's records of the cluster and the instance, which the cluster page goes on showing.
		const records = [
			getClusterInfoQueryOptions('clu-1'),
			getInstanceInfoQueryOptions({ clusterId: 'clu-1', instanceId: 'ins-a' }),
		];
		for (const options of records) {
			await queryClient.fetchQuery({ ...options, queryFn: () => ({}) } as never);
		}
		kept.push(...records.map(({ queryKey }) => queryKey));

		await signOutOfInstance({ instance: makeInstance('ins-a', 'node-a.example.com'), instanceClient: makeClient() });

		expect(dropped.filter(cached)).toEqual([]);
		expect(kept.filter(cached)).toEqual(kept);
	});

	it('rejects a read still out at the sign-out, so its answer neither lands nor reaches its caller (#1993)', async () => {
		const queryKey = ['ins-a', 'get_components'];
		queryClient.setQueryData(queryKey, { entries: ['from the previous session'] });
		let answer!: (tree: { entries: string[] }) => void;
		// The component-tree reload a CLI import waits on (`reloadRootEntries`).
		const reload = queryClient.fetchQuery({
			queryKey,
			queryFn: () => new Promise<{ entries: string[] }>((resolve) => answer = resolve),
			staleTime: 0,
		});

		await signOutOfInstance({ instance: makeInstance('ins-a', 'node-a.example.com'), instanceClient: makeClient() });
		answer({ entries: ['read before the sign-out, answered after it'] });

		await expect(reload).rejects.toSatisfy(isCancelledError);
		expect(queryClient.getQueryData(queryKey)).toBeUndefined();
	});

	it('signs out the instance AND its cluster, but not sibling instances (#1320)', async () => {
		// Signing in to a cluster flags the cluster and all of its instances as authenticated
		// (see useClusterInstanceSignIn) — recreate that state.
		authStore.setUserForIdAndKey('clu-1', 'https://cluster.example.com:9925/', user);
		authStore.setUserForIdAndKey('ins-a', 'https://node-a.example.com:9925/', user);
		authStore.setUserForIdAndKey('ins-b', 'https://node-b.example.com:9925/', user);

		const instanceClient = makeClient();
		await signOutOfInstance({ instance: makeInstance('ins-a', 'node-a.example.com'), instanceClient });

		expect(instanceClient.post).toHaveBeenCalledWith('/', { operation: 'logout' });
		expect(authStore.getConnectionById('ins-a').user).toBeNull();
		expect(authStore.getConnectionById('clu-1').user).toBeNull();
		expect(authStore.getConnectionById('ins-b').user).toBe(user);
		// The persisted potentially-authenticated flags drive reloads on the next visit; the
		// cluster's must be gone or it retries the dead session and hits "Must login".
		expect(authStore.getOperationsUrl('clu-1')).toBeUndefined();
		expect(authStore.getOperationsUrl('ins-a')).toBeUndefined();
		expect(authStore.getOperationsUrl('ins-b')).toBe('https://node-b.example.com:9925/');
	});

	it("clears the cluster's stored credentials and Fabric Connect flag", async () => {
		authStore.flagForBasicAuth('clu-1', { username: 'admin', password: 'pw' });
		authStore.flagForFabricConnect('clu-1', true);

		await signOutOfInstance({
			instance: makeInstance('ins-a', 'node-a.example.com'),
			instanceClient: makeClient(),
		});

		expect(authStore.checkForBasicAuth('clu-1')).toBeUndefined();
		expect(authStore.checkForFabricConnect('clu-1')).toBe(false);
	});

	it('clears local state for the instance and cluster even when the server-side logout fails', async () => {
		authStore.setUserForIdAndKey('clu-1', 'https://cluster.example.com:9925/', user);
		authStore.setUserForIdAndKey('ins-a', 'https://node-a.example.com:9925/', user);
		authStore.flagForBasicAuth('ins-a', { username: 'admin', password: 'pw' });
		const instanceClient = { post: vi.fn().mockRejectedValue(new Error('network down')) } as unknown as AxiosInstance;

		// Resolves despite the failed POST — a failed logout must not leave stale flags/credentials.
		await signOutOfInstance({ instance: makeInstance('ins-a', 'node-a.example.com'), instanceClient });

		expect(authStore.getConnectionById('ins-a').user).toBeNull();
		expect(authStore.getConnectionById('clu-1').user).toBeNull();
		expect(authStore.checkForBasicAuth('ins-a')).toBeUndefined();
	});
});
