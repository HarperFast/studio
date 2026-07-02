/** @vitest-environment jsdom */
import type { Instance, LocalUser } from '@/integrations/api/api.patch';
import type { AxiosInstance } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Imported after jsdom localStorage exists — the store snapshots it in its constructor.
const { authStore } = await import('@/features/auth/store/authStore');
const { signOutOfInstance } = await import('@/features/cluster/signOutOfInstance');

const user = { username: 'admin' } as LocalUser;

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

	it('leaves the server-side logout error to the caller and keeps local state intact', async () => {
		authStore.setUserForIdAndKey('clu-1', 'https://cluster.example.com:9925/', user);
		const instanceClient = { post: vi.fn().mockRejectedValue(new Error('network down')) } as unknown as AxiosInstance;

		await expect(signOutOfInstance({ instance: makeInstance('ins-a', 'node-a.example.com'), instanceClient }))
			.rejects.toThrow('network down');

		expect(authStore.getConnectionById('clu-1').user).toBe(user);
	});
});
