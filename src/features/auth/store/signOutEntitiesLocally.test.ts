/** @vitest-environment jsdom */
import { readEntitySettings, writeEntitySettings } from '@/features/instance/apis/explorer/settings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore } from './authStore';

const { getInstanceUserInfo } = vi.hoisted(() => ({ getInstanceUserInfo: vi.fn() }));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({ getInstanceUserInfo }));

type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;

function remember(id: string) {
	const user = { username: 'admin' } as SetArgs[2];
	authStore.setUserForIdAndKey(id as SetArgs[0], `https://${id}.example.com:9925/` as SetArgs[1], user);
	authStore.flagForBasicAuth(id, { username: 'admin', password: 'hunter2' });
	authStore.flagForFabricConnect(id, true);
	writeEntitySettings(id, { auth: { type: 'bearer', token: 'secret' }, authGeneration: 0 });
}

function remembered(id: string) {
	return {
		user: authStore.getConnectionById(id).user,
		marker: authStore.getOperationsUrl(id),
		basicAuth: authStore.checkForBasicAuth(id),
		fabricConnect: authStore.checkForFabricConnect(id),
		explorer: readEntitySettings(id),
	};
}

const forgotten = { user: null, marker: undefined, basicAuth: undefined, fabricConnect: false, explorer: {} };

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
	for (const id of ['clu-1', 'ins-1', 'ins-2', 'clu-2']) {
		authStore.signOutLocally(id);
	}
});

describe('authStore.signOutEntitiesLocally', () => {
	it('forgets every listed entity and nothing else', () => {
		for (const id of ['clu-1', 'ins-1', 'ins-2', 'clu-2']) {
			remember(id);
		}

		authStore.signOutEntitiesLocally(['clu-1', 'ins-1', 'ins-2']);

		expect(remembered('clu-1')).toEqual(forgotten);
		expect(remembered('ins-1')).toEqual(forgotten);
		expect(remembered('ins-2')).toEqual(forgotten);
		expect(remembered('clu-2')).toMatchObject({ user: { username: 'admin' }, fabricConnect: true });
	});

	it('signs an id listed twice out once', () => {
		const signOut = vi.spyOn(authStore, 'signOutLocally');

		authStore.signOutEntitiesLocally(['clu-1', 'ins-1', 'clu-1']);

		expect(signOut.mock.calls).toEqual([['clu-1'], ['ins-1']]);
	});

	it('keeps going, and does not throw, when one entity fails to clear', () => {
		remember('ins-1');
		const failure = new Error('storage refused');
		const signOutLocally = authStore.signOutLocally.bind(authStore);
		vi.spyOn(authStore, 'signOutLocally').mockImplementation((id) => {
			if (id === 'clu-1') {
				throw failure;
			}
			signOutLocally(id);
		});
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		expect(() => authStore.signOutEntitiesLocally(['clu-1', 'ins-1'])).not.toThrow();

		expect(remembered('ins-1')).toEqual(forgotten);
		expect(consoleError).toHaveBeenCalledWith(failure);
	});

	it('drops a sign-in check that answers after the entity was forgotten', async () => {
		remember('ins-1');
		let answer: (user: unknown) => void = () => undefined;
		getInstanceUserInfo.mockReturnValue(new Promise((resolve) => (answer = resolve)));
		const check = authStore.reloadUser('ins-1');

		authStore.signOutEntitiesLocally(['ins-1']);
		answer({ username: 'admin' });
		await check;

		expect(remembered('ins-1')).toEqual(forgotten);
	});
});
