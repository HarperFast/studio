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

	it('reports a marker record it could neither rewrite nor remove', () => {
		signIn('ins-a');
		signIn('ins-b');
		failEveryStorageWrite();
		const refusal = new DOMException('Storage refused.', 'SecurityError');
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
			throw refusal;
		});
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		expect(() => authStore.signOutLocally('ins-a')).not.toThrow();

		expect(JSON.parse(localStorage.getItem(MARKERS) ?? '{}')).toHaveProperty('ins-a');
		expect(consoleError).toHaveBeenCalledWith(refusal);
	});

	describe('once storage works again after refusing to rewrite or remove the marker record', () => {
		beforeEach(() => {
			signIn('ins-p');
			signIn('ins-q');
			failEveryStorageWrite();
			vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
				throw new DOMException('Storage refused.', 'SecurityError');
			});
			vi.spyOn(console, 'error').mockImplementation(() => undefined);
			authStore.signOutLocally('ins-p');
			vi.restoreAllMocks();
		});

		afterEach(() => {
			['ins-q', 'ins-r', 'ins-s'].forEach((id) => authStore.signOutLocally(id));
		});

		// What another tab's write leaves: the record as it reads it, which still marks the entity this tab signed out.
		function writeInAnotherTab(change: (markers: Record<string, string>) => void) {
			const markers = JSON.parse(localStorage.getItem(MARKERS) || '{}');
			change(markers);
			localStorage.setItem(MARKERS, JSON.stringify(markers));
		}

		it('leaves neither signed-out entity marked at the next sign-out', () => {
			authStore.signOutLocally('ins-q');

			const markers = JSON.parse(localStorage.getItem(MARKERS) || '{}');
			expect(markers).not.toHaveProperty('ins-p');
			expect(markers).not.toHaveProperty('ins-q');
		});

		it('writes the sign-ins this tab holds, and not the one it signed out, at the next sign-in', () => {
			signIn('ins-r');

			const markers = JSON.parse(localStorage.getItem(MARKERS) || '{}');
			expect(markers).toMatchObject({ 'ins-q': 'https://ins-q', 'ins-r': 'https://ins-r' });
			expect(markers).not.toHaveProperty('ins-p');
		});

		it('leaves out, at the next sign-in, a sign-in another tab has ended since', () => {
			writeInAnotherTab((markers) => {
				delete markers['ins-q'];
			});

			signIn('ins-r');

			expect(JSON.parse(localStorage.getItem(MARKERS) || '{}')).not.toHaveProperty('ins-q');
		});

		it('reaches, at a full sign-out, a sign-in only another tab has made since', () => {
			writeInAnotherTab((markers) => {
				markers['ins-s'] = 'https://ins-s';
			});
			localStorage.setItem('Studio:BasicAuth:ins-s', btoa(JSON.stringify({ username: 'u', password: 'p' })));

			authStore.signOutAllLocally();

			expect(authStore.checkForBasicAuth('ins-s')).toBeUndefined();
			expect(JSON.parse(localStorage.getItem(MARKERS) || '{}')).toEqual({});
		});

		it('takes the entity out at the next sign-out of any other', () => {
			authStore.signOutLocally('ins-never-signed-in');

			expect(JSON.parse(localStorage.getItem(MARKERS) || '{}')).not.toHaveProperty('ins-p');
		});

		it.each([
			['a write', () => authStore.signOutLocally('ins-q')],
			['a removal', () => {
				failEveryStorageWrite();
				authStore.signOutLocally('ins-q');
				vi.restoreAllMocks();
			}],
		])('keeps the entity once %s lands and another tab signs it back in', (_, land) => {
			land();
			writeInAnotherTab((markers) => {
				markers['ins-p'] = 'https://ins-p';
			});

			signIn('ins-r');

			expect(JSON.parse(localStorage.getItem(MARKERS) || '{}')).toHaveProperty('ins-p');
		});

		it('reaches the entity at a full sign-out after another tab signs it back in', () => {
			writeInAnotherTab((markers) => {
				markers['ins-p'] = 'https://ins-p';
			});
			localStorage.setItem('Studio:BasicAuth:ins-p', btoa(JSON.stringify({ username: 'u', password: 'p' })));

			authStore.signOutAllLocally();

			// Raw: this tab still reads the credential it could not remove at the first sign-out as absent.
			expect(localStorage.getItem('Studio:BasicAuth:ins-p')).toBeNull();
		});

		it("keeps an entity it never marked when storage refuses that sign-out's write too", () => {
			failEveryStorageWrite();
			vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
				throw new DOMException('Storage refused.', 'SecurityError');
			});
			vi.spyOn(console, 'error').mockImplementation(() => undefined);
			authStore.signOutLocally('ins-never-signed-in');
			vi.restoreAllMocks();
			writeInAnotherTab((markers) => {
				markers['ins-never-signed-in'] = 'https://ins-never-signed-in';
			});

			signIn('ins-r');

			expect(JSON.parse(localStorage.getItem(MARKERS) || '{}')).toHaveProperty('ins-never-signed-in');
		});
	});

	it('writes a sign-in storage refused to record at the next one', () => {
		failEveryStorageWrite();
		expect(() => signIn('ins-refused')).toThrow();
		vi.restoreAllMocks();

		signIn('ins-refused');

		expect(JSON.parse(localStorage.getItem(MARKERS) || '{}')).toHaveProperty('ins-refused');
		authStore.signOutLocally('ins-refused');
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
