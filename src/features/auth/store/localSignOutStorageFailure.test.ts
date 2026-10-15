/** @vitest-environment jsdom */
import { readEntitySettings, writeEntitySettings } from '@/features/instance/apis/explorer/settings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore, OverallAppSignIn } from './authStore';
import { seedSignInMarkers, storedSignInMarkers } from './signInMarkersTestHelpers';

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

	it("removes a signed-out entity's marker, and only it, while writes fail", () => {
		signIn('ins-a');
		signIn('ins-b');
		failEveryStorageWrite();

		authStore.signOutLocally('ins-a');

		expect(storedSignInMarkers()).toEqual({ 'ins-b': 'https://ins-b' });
		expect(authStore.getOperationsUrl('ins-b')).toBe('https://ins-b');
		authStore.signOutLocally('ins-b');
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
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		expect(() => authStore.signOutLocally('ins-direct')).not.toThrow();

		expect(authStore.getOperationToken('ins-direct')).toBeUndefined();
		expect(authStore.getConnectionById('ins-direct').user).toBeNull();
	});

	it('blanks credentials storage refused to remove, so a reload reads them as absent too', () => {
		signIn('ins-a');
		authStore.flagForBasicAuth('ins-a', { username: 'a', password: 'pa' });
		authStore.flagForFabricConnect('ins-a', true);
		const refusal = new DOMException('Storage refused.', 'SecurityError');
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
			throw refusal;
		});
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		authStore.signOutLocally('ins-a');

		expect(localStorage.getItem('Studio:BasicAuth:ins-a')).toBe('');
		expect(localStorage.getItem('Studio:FabricConnect:ins-a')).toBe('');
		expect(authStore.checkForBasicAuth('ins-a')).toBeUndefined();
		expect(authStore.checkForFabricConnect('ins-a')).toBe(false);
		expect(consoleError).toHaveBeenCalledWith(refusal);
	});

	it('stops reading credentials storage would neither remove nor overwrite, until a sign-in writes new ones', () => {
		signIn('ins-a');
		authStore.flagForBasicAuth('ins-a', { username: 'a', password: 'pa' });
		authStore.flagForFabricConnect('ins-a', true);
		failEveryStorageWrite();
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
			throw new DOMException('Storage refused.', 'SecurityError');
		});
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		authStore.signOutLocally('ins-a');

		expect(localStorage.getItem('Studio:BasicAuth:ins-a')).toBeTruthy();
		expect(authStore.checkForBasicAuth('ins-a')).toBeUndefined();
		expect(authStore.checkForFabricConnect('ins-a')).toBe(false);

		vi.restoreAllMocks();
		authStore.flagForBasicAuth('ins-a', { username: 'b', password: 'pb' });
		authStore.flagForFabricConnect('ins-a', true);

		expect(authStore.checkForBasicAuth('ins-a')).toEqual({ username: 'b', password: 'pb' });
		expect(authStore.checkForFabricConnect('ins-a')).toBe(true);
	});

	it('reports a marker storage would neither remove nor blank', () => {
		signIn('ins-a');
		failEveryStorageWrite();
		const refusal = new DOMException('Storage refused.', 'SecurityError');
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
			throw refusal;
		});
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		expect(() => authStore.signOutLocally('ins-a')).not.toThrow();

		expect(storedSignInMarkers()).toHaveProperty('ins-a');
		expect(consoleError).toHaveBeenCalledWith(refusal);
	});

	describe("once storage works again after keeping a signed-out entity's marker", () => {
		beforeEach(() => {
			signIn('ins-p');
			failEveryStorageWrite();
			vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
				throw new DOMException('Storage refused.', 'SecurityError');
			});
			vi.spyOn(console, 'error').mockImplementation(() => undefined);
			authStore.signOutLocally('ins-p');
			vi.restoreAllMocks();
		});

		afterEach(() => {
			authStore.signOutLocally('ins-r');
		});

		it.each([
			['sign-out of another entity', () => authStore.signOutLocally('ins-never-signed-in')],
			['sign-in', () => signIn('ins-r')],
		])('removes it at the next %s', (_, write) => {
			write();

			expect(storedSignInMarkers()).not.toHaveProperty('ins-p');
		});

		it('reaches it at a full sign-out after another tab signs it back in', () => {
			seedSignInMarkers({ 'ins-p': 'https://ins-p' });
			localStorage.setItem('Studio:BasicAuth:ins-p', btoa(JSON.stringify({ username: 'u', password: 'p' })));

			authStore.signOutAllLocally();

			// Raw: this tab still reads the credential it could not remove at the first sign-out as absent.
			expect(localStorage.getItem('Studio:BasicAuth:ins-p')).toBeNull();
		});
	});

	describe('a sign-in storage refused to record', () => {
		afterEach(() => {
			authStore.signOutLocally('ins-refused');
		});

		it('still signs in, without throwing', () => {
			failEveryStorageWrite();

			expect(() => signIn('ins-refused')).not.toThrow();

			expect(authStore.getConnectionById('ins-refused').user).toEqual({ username: 'u' });
		});

		it('is recorded at the next sign-in', () => {
			failEveryStorageWrite();
			signIn('ins-refused');
			vi.restoreAllMocks();

			signIn('ins-refused');

			expect(storedSignInMarkers()).toHaveProperty('ins-refused');
		});

		it('is recorded at its next check, and a check that still cannot record it settles', async () => {
			getInstanceUserInfo.mockResolvedValue({ username: 'u' });
			failEveryStorageWrite();
			signIn('ins-refused');

			await expect(authStore.reloadUser('ins-refused')).resolves.toEqual({ username: 'u' });
			expect(authStore.getConnectionById('ins-refused').isLoading).toBe(false);

			vi.restoreAllMocks();
			await authStore.reloadUser('ins-refused');
			expect(storedSignInMarkers()).toHaveProperty('ins-refused');
		});
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
