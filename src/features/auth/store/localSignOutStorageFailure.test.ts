/** @vitest-environment jsdom */
import { readEntitySettings, writeEntitySettings } from '@/features/instance/apis/explorer/settings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore, OverallAppSignIn } from './authStore';

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

const MARKERS = 'Studio:PotentiallyAuthenticated';

function signIn(id: string) {
	authStore.setUserForIdAndKey(id as SetArgs[0], `https://${id}` as SetArgs[1], { username: 'u' } as SetArgs[2]);
}

// Spying on `localStorage.setItem` itself is inert under jsdom, which dispatches through the prototype.
function failEveryStorageWrite() {
	return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
	});
}

describe('authStore local sign-out when storage writes throw', () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('still destroys every credential it is responsible for', () => {
		signIn('ins-a');
		authStore.flagForBasicAuth('ins-a', { username: 'u', password: 'p' });
		authStore.flagForFabricConnect('ins-a', true);
		writeEntitySettings('ins-a', { auth: { type: 'bearer', token: 'secret-token' }, authGeneration: 0 });
		failEveryStorageWrite();

		expect(() => authStore.signOutLocally('ins-a')).not.toThrow();

		expect(authStore.checkForBasicAuth('ins-a')).toBeUndefined();
		expect(authStore.checkForFabricConnect('ins-a')).toBe(false);
		expect(authStore.getConnectionById('ins-a').user).toBeNull();
		expect(readEntitySettings('ins-a')).toEqual({});
	});

	it('drops the whole marker record rather than leave a signed-out entity marked', () => {
		signIn('ins-a');
		signIn('ins-b');
		failEveryStorageWrite();

		authStore.signOutLocally('ins-a');

		expect(localStorage.getItem(MARKERS)).toBeNull();
		// Only the persisted record is lost; this tab still knows it is signed into the other entity.
		expect(authStore.getOperationsUrl('ins-b')).toBe('https://ins-b');
	});

	it('drops the in-memory direct-connect token even when storage refuses removal', async () => {
		createInstanceAuthenticationTokens.mockResolvedValue({ operationToken: 'jwt-token', refreshToken: 'refresh' });
		getInstanceUserInfo.mockResolvedValue({ username: 'u' });
		await authStore.establishFabricConnectAuth({
			id: 'ins-direct',
			operationsUrl: 'https://ins-direct.example.com:9925/',
		});
		expect(authStore.getOperationToken('ins-direct')).toBe('jwt-token');
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
			throw new DOMException('Storage refused.', 'SecurityError');
		});

		expect(() => authStore.signOutLocally('ins-direct')).not.toThrow();

		expect(authStore.getOperationToken('ins-direct')).toBeUndefined();
		expect(authStore.getConnectionById('ins-direct').user).toBeNull();
	});

	it('lets signOutAllLocally reach every entity and the cloud slot', () => {
		authStore.setUserForIdAndKey(OverallAppSignIn, OverallAppSignIn, { id: 'usr_a' } as SetArgs[2]);
		signIn('ins-a');
		signIn('ins-b');
		failEveryStorageWrite();

		expect(() => authStore.signOutAllLocally()).not.toThrow();

		expect(authStore.getConnectionById('ins-a').user).toBeNull();
		expect(authStore.getConnectionById('ins-b').user).toBeNull();
		expect(authStore.getConnectionById(OverallAppSignIn).user).toBeNull();
	});
});
