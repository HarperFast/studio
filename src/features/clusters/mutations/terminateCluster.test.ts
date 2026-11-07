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

const { describeTermination, terminateCluster, terminationStarted } = await import('./terminateCluster');

type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;
const ENTITIES = ['clu-1', 'ins-1', 'ins-2', 'clu-2'];
const DELETED = { data: { id: 'clu-1', deleted: true } };
// central-manager#1134: the delete is admitted as a workflow and answered before the teardown.
const ADMITTED = { data: { id: 'clu-1', workflowId: 'wf-1', status: 'TERMINATING' } };
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

	it('forgets the sign-ins just the same when central manager only admitted the delete', async () => {
		apiDelete.mockResolvedValue(ADMITTED);

		await expect(terminateCluster('clu-1')).resolves.toEqual(ADMITTED.data);

		await vi.waitFor(() => expect(rememberedEntities()).toEqual(['clu-2']));
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

describe('the two answers to a delete', () => {
	it('reads a delete as finished only when central manager said so', () => {
		expect(terminationStarted(ADMITTED.data)).toBe(true);
		expect(terminationStarted(DELETED.data)).toBe(false);
		// A repeated delete of a cluster already gone answers 204 with no body; nothing in it says the teardown ran.
		expect(terminationStarted(undefined)).toBe(true);
		expect(terminationStarted({ id: 'clu-1', workflowId: 'wf-1', status: 'PAUSED' })).toBe(true);
	});

	it('announces a start, not an end, for an admitted delete', () => {
		expect(describeTermination(ADMITTED.data, false)).toBe(
			'Cluster termination started. It stays listed as Terminating until every instance is gone.',
		);
		expect(describeTermination(ADMITTED.data, true)).toBe(
			'Cluster removal started. It stays listed until Harper Fabric has let go of every instance.',
		);
	});

	it('keeps the finished wording for the older central manager', () => {
		expect(describeTermination(DELETED.data, false)).toBe('Cluster successfully terminated.');
		expect(describeTermination(DELETED.data, true)).toBe('Cluster successfully removed.');
	});

	it('claims neither for an answer that says nothing about the teardown', () => {
		expect(describeTermination(undefined, false)).toBe('Cluster termination requested.');
		expect(describeTermination({ id: 'clu-1', status: 'PAUSED' }, true)).toBe('Cluster removal requested.');
	});
});
