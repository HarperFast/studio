/** @vitest-environment jsdom */
import axios, { type AxiosAdapter, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore } from './authStore';

const { createInstanceAuthenticationTokens, getInstanceUserInfo } = vi.hoisted(() => ({
	createInstanceAuthenticationTokens: vi.fn(),
	getInstanceUserInfo: vi.fn(),
}));
vi.mock('@/integrations/api/instance/auth/createInstanceAuthenticationTokens', () => ({
	createInstanceAuthenticationTokens,
	refreshInstanceOperationToken: vi.fn(),
}));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({ getInstanceUserInfo }));

type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;
const ID = 'ins-late';
const URL = 'https://ins-late.example.com:9925/';
const OLD = { username: 'admin', password: 'old' };
const NEW = { username: 'admin', password: 'new' };
const defaultAdapter = axios.defaults.adapter;
let answerLogout: (() => void) | undefined;

beforeEach(() => {
	localStorage.clear();
	answerLogout = undefined;
	axios.defaults.adapter = ((config) =>
		new Promise<AxiosResponse>((resolve) => {
			answerLogout = () => resolve({ status: 200, statusText: 'OK', data: { message: 'ok' }, headers: {}, config });
		})) as AxiosAdapter;
	authStore.setUserForIdAndKey(ID, URL as SetArgs[1], { username: 'admin' } as SetArgs[2]);
	authStore.flagForBasicAuth(ID, OLD);
	vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
	axios.defaults.adapter = defaultAdapter;
	vi.resetAllMocks();
	vi.restoreAllMocks();
	authStore.signOutLocally(ID);
});

describe.each([
	{ path: 'an app sign-out', signOut: () => authStore.signOutFromPotentiallyAuthenticatedInstances() },
	{ path: 'removing its cluster', signOut: () => authStore.signOutEntities([ID]) },
])('a logout from $path that answers after a new sign-in', ({ signOut }) => {
	async function signInWhileTheLogoutIsOut(signIn: () => Promise<unknown> | void) {
		const done = signOut();
		await vi.waitFor(() => expect(answerLogout).toBeDefined());
		await signIn();
		answerLogout!();
		await done;
	}

	it('keeps the new Basic Auth credential', async () => {
		await signInWhileTheLogoutIsOut(() => authStore.flagForBasicAuth(ID, NEW));

		expect(authStore.checkForBasicAuth(ID)).toEqual(NEW);
	});

	it('keeps a Basic Auth credential another tab stored', async () => {
		await signInWhileTheLogoutIsOut(() => localStorage.setItem(`Studio:BasicAuth:${ID}`, btoa(JSON.stringify(NEW))));

		expect(authStore.checkForBasicAuth(ID)).toEqual(NEW);
	});

	it('clears again on the answer when nothing replaced the sign-in', async () => {
		const flagForBasicAuth = vi.spyOn(authStore, 'flagForBasicAuth');

		await signInWhileTheLogoutIsOut(() => undefined);

		expect(flagForBasicAuth.mock.calls).toEqual([[ID, null], [ID, null]]);
	});

	it('keeps the new Fabric Connect flag', async () => {
		await signInWhileTheLogoutIsOut(() => authStore.flagForFabricConnect(ID, true));

		expect(authStore.checkForFabricConnect(ID)).toBe(true);
	});

	it('keeps the token of a Fabric Connect that is still verifying when the answer lands', async () => {
		createInstanceAuthenticationTokens.mockResolvedValue({ operationToken: 'new-token' });
		let verify: (user: unknown) => void = () => undefined;
		getInstanceUserInfo.mockReturnValue(new Promise((resolve) => (verify = resolve)));
		let connect: Promise<unknown> = Promise.resolve();

		await signInWhileTheLogoutIsOut(async () => {
			connect = authStore.establishFabricConnectAuth({ id: ID, operationsUrl: URL });
			await vi.waitFor(() => expect(getInstanceUserInfo).toHaveBeenCalled());
		});
		verify({ username: 'admin' });
		await connect;

		expect(authStore.getOperationToken(ID)).toBe('new-token');
	});
});
