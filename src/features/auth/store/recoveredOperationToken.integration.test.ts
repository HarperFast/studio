/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';

const createInstanceAuthenticationTokens = vi.fn();
const refreshInstanceOperationToken = vi.fn();
const getInstanceUserInfo = vi.fn();
vi.mock('@/integrations/api/instance/auth/createInstanceAuthenticationTokens', () => ({
	createInstanceAuthenticationTokens: (...args: unknown[]) => createInstanceAuthenticationTokens(...args),
	refreshInstanceOperationToken: (...args: unknown[]) => refreshInstanceOperationToken(...args),
	mintOperationTokenWithCredentials: vi.fn(),
}));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({
	getInstanceUserInfo: (...args: unknown[]) => getInstanceUserInfo(...args),
}));

const { authStore } = await import('@/features/auth/store/authStore');

const ID = 'ins-recovered';
const OPERATIONS_URL = 'https://ins-recovered.example.com:9925/';

describe('a recovered operation token', () => {
	it('is what getOperationToken returns once the refresh succeeds', async () => {
		createInstanceAuthenticationTokens.mockResolvedValue({ operationToken: 'op-1', refreshToken: 'rt-1' });
		getInstanceUserInfo.mockResolvedValue({ username: 'someone' });
		await authStore.establishFabricConnectAuth({ id: ID, operationsUrl: OPERATIONS_URL });
		expect(authStore.getOperationToken(ID)).toBe('op-1');

		refreshInstanceOperationToken.mockResolvedValue('op-2');

		const recovered = await authStore.recoverExpiredOperationToken(ID);

		expect(recovered).toBe('op-2');
		expect(authStore.getOperationToken(ID)).toBe(recovered);
	});
});
