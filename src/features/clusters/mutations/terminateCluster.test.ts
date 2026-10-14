/** @vitest-environment jsdom */
import { authStore } from '@/features/auth/store/authStore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiDelete, apiGet } = vi.hoisted(() => ({ apiDelete: vi.fn(), apiGet: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { delete: apiDelete, get: apiGet } }));

const { terminateCluster } = await import('./terminateCluster');

type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;
const ENTITIES = ['clu-1', 'ins-1', 'ins-2', 'clu-2'];

function remember(id: string) {
	const user = { username: 'admin' } as SetArgs[2];
	authStore.setUserForIdAndKey(id as SetArgs[0], `https://${id}.example.com:9925/` as SetArgs[1], user);
	authStore.flagForBasicAuth(id, { username: 'admin', password: 'hunter2' });
}

function isRemembered(id: string) {
	return !!authStore.getOperationsUrl(id) && !!authStore.checkForBasicAuth(id);
}

function rememberedEntities() {
	return ENTITIES.filter(isRemembered);
}

beforeEach(() => {
	localStorage.clear();
	ENTITIES.forEach(remember);
	// The organization's cluster list carries no instances; the cluster record does.
	apiGet.mockResolvedValue({
		data: { id: 'clu-1', status: 'TERMINATED', instances: [{ id: 'ins-1' }, { id: 'ins-2' }] },
	});
	vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.resetAllMocks();
	vi.restoreAllMocks();
	ENTITIES.forEach((id) => authStore.signOutLocally(id));
});

describe(terminateCluster, () => {
	it('forgets the cluster sign-in and every instance sign-in once the terminate succeeds', async () => {
		apiDelete.mockResolvedValue({ data: { id: 'clu-1', deleted: true } });

		await expect(terminateCluster('clu-1')).resolves.toEqual({ id: 'clu-1', deleted: true });

		await vi.waitFor(() => expect(rememberedEntities()).toEqual(['clu-2']));
		expect(apiGet).toHaveBeenCalledWith('/Cluster/clu-1');
	});

	it('still succeeds, and forgets the cluster sign-in, when the instances cannot be read back', async () => {
		apiDelete.mockResolvedValue({ data: { id: 'clu-1', deleted: true } });
		apiGet.mockRejectedValue(new Error('Network Error'));

		await expect(terminateCluster('clu-1')).resolves.toEqual({ id: 'clu-1', deleted: true });

		await vi.waitFor(() => expect(console.debug).toHaveBeenCalled());
		expect(rememberedEntities()).toEqual(['ins-1', 'ins-2', 'clu-2']);
	});

	it('forgets nothing when the terminate fails', async () => {
		apiDelete.mockRejectedValue(new Error('Request failed with status code 400'));

		await expect(terminateCluster('clu-1')).rejects.toThrow('400');

		expect(rememberedEntities()).toEqual(ENTITIES);
		expect(apiGet).not.toHaveBeenCalled();
	});
});
