/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore } from './authStore';

const { getInstanceClient, onInstanceLogoutSubmit } = vi.hoisted(() => ({
	getInstanceClient: vi.fn(),
	onInstanceLogoutSubmit: vi.fn(),
}));
vi.mock('@/config/getInstanceClient', () => ({ getInstanceClient, connectsThroughProxy: () => false }));
vi.mock('@/integrations/api/instance/auth/onInstanceLogoutSubmit', () => ({ onInstanceLogoutSubmit }));

type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;
const at = 'https://ins-a.example.com:9925/';
const older = { username: 'admin', password: 'older' };
const newer = { username: 'admin', password: 'newer' };

/** A client built with `older`, which another tab has replaced in storage since. */
function clientBuiltWithOlderCredential() {
	return {
		defaults: { baseURL: at, auth: older, withCredentials: false, timeout: 0 },
		interceptors: { request: { clear: vi.fn() }, response: { clear: vi.fn() } },
	};
}

function loggedOutWith() {
	return onInstanceLogoutSubmit.mock.calls.map(([{ instanceClient }]) => [
		instanceClient.defaults.auth,
		instanceClient.defaults.withCredentials,
	]);
}

beforeEach(() => {
	localStorage.clear();
	getInstanceClient.mockImplementation(clientBuiltWithOlderCredential);
	onInstanceLogoutSubmit.mockResolvedValue({ message: 'ok' });
	authStore.setUserForIdAndKey('ins-a' as SetArgs[0], at as SetArgs[1], { username: 'admin' } as SetArgs[2]);
});

afterEach(() => {
	vi.resetAllMocks();
	authStore.signOutLocally('ins-a');
	localStorage.clear();
});

describe('a logout client built just before another tab replaced the Basic Auth credential', () => {
	it('carries the credential stored for its URL, not the one it was built with', async () => {
		authStore.flagForBasicAuth('ins-a', { ...newer, url: at });

		await authStore.signOutEntities(['ins-a']);

		expect(loggedOutWith()).toEqual([[newer, false]]);
	});

	it('carries none when the credential is now stored for another URL', async () => {
		authStore.flagForBasicAuth('ins-a', { ...newer, url: 'https://ins-a-2.example.com:9925/' });

		await authStore.signOutEntities(['ins-a']);

		expect(loggedOutWith()).toEqual([[undefined, true]]);
	});
});
