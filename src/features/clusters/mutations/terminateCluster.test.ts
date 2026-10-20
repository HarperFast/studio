/** @vitest-environment jsdom */
import { authStore } from '@/features/auth/store/authStore';
import { seedSignInMarkers, storedSignInMarkers } from '@/features/auth/store/signInMarkersTestHelpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiDelete, apiGet, onInstanceLogoutSubmit } = vi.hoisted(() => ({
	apiDelete: vi.fn(),
	apiGet: vi.fn(),
	onInstanceLogoutSubmit: vi.fn(),
}));
vi.mock('@/config/apiClient', () => ({ apiClient: { delete: apiDelete, get: apiGet } }));
vi.mock('@/integrations/api/instance/auth/onInstanceLogoutSubmit', () => ({ onInstanceLogoutSubmit }));

const { terminateCluster } = await import('./terminateCluster');

type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;
const ENTITIES = ['clu-1', 'ins-1', 'ins-2', 'clu-2'];
const DELETED = { data: { id: 'clu-1', deleted: true } };
// The organization's cluster list carries no instances; the cluster record does.
const RECORD = { data: { id: 'clu-1', status: 'RUNNING', instances: [{ id: 'ins-1' }, { id: 'ins-2' }] } };
const SELF_HOSTED = { data: { ...RECORD.data, plans: [{ planId: 'self-hosted-free' }] } };

function remember(id: string) {
	const user = { username: 'admin' } as SetArgs[2];
	authStore.setUserForIdAndKey(id as SetArgs[0], `https://${id}.example.com:9925/` as SetArgs[1], user);
	authStore.flagForBasicAuth(id, { username: 'admin', password: 'hunter2' });
}

function rememberedEntities() {
	return ENTITIES.filter((id) => !!authStore.getOperationsUrl(id) || !!authStore.checkForBasicAuth(id));
}

function fullyRememberedEntities() {
	return ENTITIES.filter((id) => !!authStore.getOperationsUrl(id) && !!authStore.checkForBasicAuth(id));
}

function loggedOut() {
	return onInstanceLogoutSubmit.mock.calls.map(([{ entityId }]) => entityId);
}

beforeEach(() => {
	localStorage.clear();
	ENTITIES.forEach(remember);
	apiDelete.mockResolvedValue(DELETED);
	apiGet.mockResolvedValue(RECORD);
	onInstanceLogoutSubmit.mockResolvedValue({ message: 'ok' });
	vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.resetAllMocks();
	vi.restoreAllMocks();
	ENTITIES.forEach((id) => authStore.signOutLocally(id));
});

describe(terminateCluster, () => {
	it('forgets the cluster sign-in and every instance sign-in once the terminate succeeds', async () => {
		await expect(terminateCluster('clu-1')).resolves.toEqual(DELETED.data);

		await vi.waitFor(() => expect(rememberedEntities()).toEqual(['clu-2']));
		expect(apiGet).toHaveBeenCalledWith('/Cluster/clu-1');
		expect(onInstanceLogoutSubmit).not.toHaveBeenCalled();
	});

	it('forgets sign-ins only another tab remembers', async () => {
		const markers = storedSignInMarkers();
		const otherTab = { 'clu-9': 'https://clu-9.example.com:9925/', 'ins-9': 'https://ins-9.example.com:9925/' };
		seedSignInMarkers(otherTab);
		apiDelete.mockResolvedValue({ data: { id: 'clu-9', deleted: true } });
		apiGet.mockResolvedValue({ data: { id: 'clu-9', status: 'RUNNING', instances: [{ id: 'ins-9' }] } });

		await terminateCluster('clu-9');

		await vi.waitFor(() => expect(storedSignInMarkers()).toEqual(markers));
	});

	it('reads the instances back after the terminate when the read alongside it failed', async () => {
		apiGet.mockRejectedValueOnce(new Error('Network Error'));

		await terminateCluster('clu-1');

		await vi.waitFor(() => expect(rememberedEntities()).toEqual(['clu-2']));
		expect(apiGet).toHaveBeenCalledTimes(2);
	});

	it('still succeeds, and forgets nothing, when the cluster cannot be read to tell whether it was self-hosted', async () => {
		apiGet.mockRejectedValue(new Error('Network Error'));

		await expect(terminateCluster('clu-1')).resolves.toEqual(DELETED.data);

		await vi.waitFor(() => expect(console.debug).toHaveBeenCalledTimes(2));
		expect(fullyRememberedEntities()).toEqual(ENTITIES);
		expect(onInstanceLogoutSubmit).not.toHaveBeenCalled();
	});

	it('forgets nothing when the terminate fails', async () => {
		apiDelete.mockRejectedValue(new Error('Request failed with status code 400'));

		await expect(terminateCluster('clu-1')).rejects.toThrow('400');

		await new Promise((resolve) => setTimeout(resolve));
		expect(fullyRememberedEntities()).toEqual(ENTITIES);
	});
});

describe('removing a self-hosted cluster, whose servers may still run', () => {
	beforeEach(() => {
		apiGet.mockResolvedValue(SELF_HOSTED);
	});

	it('sends the cluster and every instance a logout, and forgets them', async () => {
		await terminateCluster('clu-1');

		await vi.waitFor(() => expect(rememberedEntities()).toEqual(['clu-2']));
		expect(loggedOut()).toEqual(['clu-1', 'ins-1', 'ins-2']);
	});

	it('still forgets them when a logout fails', async () => {
		onInstanceLogoutSubmit.mockRejectedValue(new Error('timeout of 10000ms exceeded'));

		await expect(terminateCluster('clu-1')).resolves.toEqual(DELETED.data);

		await vi.waitFor(() => expect(rememberedEntities()).toEqual(['clu-2']));
		expect(loggedOut()).toEqual(['clu-1', 'ins-1', 'ins-2']);
	});

	it('finishes the removal without waiting for the logouts', async () => {
		onInstanceLogoutSubmit.mockReturnValue(new Promise(() => undefined));

		await expect(terminateCluster('clu-1')).resolves.toEqual(DELETED.data);

		await vi.waitFor(() => expect(loggedOut()).toEqual(['clu-1', 'ins-1', 'ins-2']));
		expect(rememberedEntities()).toEqual(['clu-2']);
	});
});
