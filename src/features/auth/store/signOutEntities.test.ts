/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore } from './authStore';
import { seedSignInMarkers, storedSignInMarkers } from './signInMarkersTestHelpers';

const { onInstanceLogoutSubmit } = vi.hoisted(() => ({ onInstanceLogoutSubmit: vi.fn() }));
vi.mock('@/integrations/api/instance/auth/onInstanceLogoutSubmit', () => ({ onInstanceLogoutSubmit }));

type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;
const ENTITIES = ['clu-1', 'ins-1', 'clu-2'];

function remember(id: string) {
	const user = { username: 'admin' } as SetArgs[2];
	authStore.setUserForIdAndKey(id as SetArgs[0], `https://${id}.example.com:9925/` as SetArgs[1], user);
	authStore.flagForBasicAuth(id, { username: 'admin', password: 'hunter2' });
}

function rememberedEntities() {
	return ENTITIES.filter((id) => !!authStore.getOperationsUrl(id) || !!authStore.checkForBasicAuth(id));
}

function loggedOut() {
	return onInstanceLogoutSubmit.mock.calls.map(([{ entityId, instanceClient }]) => ({
		entityId,
		baseURL: instanceClient.defaults.baseURL,
		timeout: instanceClient.defaults.timeout,
		auth: instanceClient.defaults.auth,
	}));
}

beforeEach(() => {
	localStorage.clear();
	ENTITIES.forEach(remember);
	onInstanceLogoutSubmit.mockResolvedValue({ message: 'ok' });
	vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.resetAllMocks();
	vi.restoreAllMocks();
	ENTITIES.forEach((id) => authStore.signOutLocally(id));
});

describe('authStore.signOutEntities', () => {
	it('sends a logout for each remembered sign-in to its own server, with its credential and a short timeout, and forgets it', async () => {
		await authStore.signOutEntities(['clu-1', 'ins-1', 'clu-1']);

		const credential = { username: 'admin', password: 'hunter2' };
		expect(loggedOut()).toEqual([
			{ entityId: 'clu-1', baseURL: 'https://clu-1.example.com:9925/', timeout: 10_000, auth: credential },
			{ entityId: 'ins-1', baseURL: 'https://ins-1.example.com:9925/', timeout: 10_000, auth: credential },
		]);
		expect(rememberedEntities()).toEqual(['clu-2']);
	});

	it('forgets the sign-ins, and resolves, when a logout fails', async () => {
		const consoleError = vi.spyOn(console, 'error');
		onInstanceLogoutSubmit.mockRejectedValue(new Error('connect ECONNREFUSED'));

		await expect(authStore.signOutEntities(['clu-1', 'ins-1'])).resolves.toBeUndefined();

		expect(rememberedEntities()).toEqual(['clu-2']);
		expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('clu-1'), 'connect ECONNREFUSED');
		expect(consoleError).not.toHaveBeenCalled();
	});

	it('forgets the sign-ins before a slow logout answers', async () => {
		let answer: () => void = () => undefined;
		onInstanceLogoutSubmit.mockReturnValue(new Promise((resolve) => (answer = () => resolve({ message: 'ok' }))));
		let settled = false;

		const signOut = authStore.signOutEntities(['clu-1']).then(() => (settled = true));

		expect(rememberedEntities()).toEqual(['ins-1', 'clu-2']);
		await new Promise((resolve) => setTimeout(resolve));
		expect(settled).toBe(false);
		answer();
		await signOut;
		expect(settled).toBe(true);
	});

	it('logs out a session-cookie sign-in, which stores no Basic Auth credential', async () => {
		const user = { username: 'admin' } as SetArgs[2];
		authStore.setUserForIdAndKey(
			'ins-cookie' as SetArgs[0],
			'https://ins-cookie.example.com:9925/' as SetArgs[1],
			user,
		);

		await authStore.signOutEntities(['ins-cookie']);

		expect(loggedOut()).toEqual([
			{ entityId: 'ins-cookie', baseURL: 'https://ins-cookie.example.com:9925/', timeout: 10_000, auth: undefined },
		]);
		expect(authStore.getOperationsUrl('ins-cookie')).toBeUndefined();
	});

	it('logs out, and forgets, a sign-in another tab made after this one read the markers', async () => {
		const markers = storedSignInMarkers();
		seedSignInMarkers({ 'ins-other-tab': 'https://ins-other-tab.example.com:9925/' });

		await authStore.signOutEntities(['ins-other-tab']);

		expect(loggedOut()).toEqual([
			{
				entityId: 'ins-other-tab',
				baseURL: 'https://ins-other-tab.example.com:9925/',
				timeout: 10_000,
				auth: undefined,
			},
		]);
		expect(storedSignInMarkers()).toEqual(markers);
	});

	it('posts no logout for a sign-in reached through the Fabric Connect proxy, and still forgets it', async () => {
		authStore.flagForBasicAuth('clu-2', null);
		authStore.flagForFabricConnect('clu-2', true);

		await authStore.signOutEntities(['clu-2', 'ins-1']);

		expect(loggedOut().map(({ entityId }) => entityId)).toEqual(['ins-1']);
		expect(authStore.checkForFabricConnect('clu-2')).toBe(false);
		expect(rememberedEntities()).toEqual(['clu-1']);
	});

	it('posts no logout for an id with nothing remembered', async () => {
		await authStore.signOutEntities(['ins-unknown']);

		expect(onInstanceLogoutSubmit).not.toHaveBeenCalled();
	});
});
