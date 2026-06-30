import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/apiClient', () => ({
	apiClient: { defaults: { baseURL: 'https://cm.example.com' } },
}));

vi.mock('@/features/auth/store/authStore', () => ({
	OverallAppSignIn: 'OverallAppSignIn',
	authStore: {
		getOperationsUrl: vi.fn(),
		checkForFabricConnect: vi.fn(),
		checkForBasicAuth: vi.fn(),
	},
}));

import { authStore } from '@/features/auth/store/authStore';
import { resolveInstanceConnection } from './resolveInstanceConnection';

const mockAuthStore = vi.mocked(authStore);

beforeEach(() => {
	vi.resetAllMocks();
	mockAuthStore.checkForFabricConnect.mockReturnValue(false);
	mockAuthStore.checkForBasicAuth.mockReturnValue(undefined);
});

describe('resolveInstanceConnection', () => {
	it('uses basic auth for a direct connection', () => {
		mockAuthStore.getOperationsUrl.mockReturnValue('https://host:9925');
		mockAuthStore.checkForBasicAuth.mockReturnValue({ username: 'admin', password: 'pw' });

		const { url, headers, credentials } = resolveInstanceConnection({ id: 'ins-1' });

		expect(url).toBe('https://host:9925/');
		expect(headers.Authorization).toBe(`Basic ${btoa('admin:pw')}`);
		expect(headers.Accept).toBe('text/event-stream');
		expect(headers['Content-Type']).toBe('application/json');
		// Direct + basic auth → no cookies needed.
		expect(credentials).toBe('same-origin');
	});

	it('uses cookie credentials for a direct connection without basic auth', () => {
		mockAuthStore.getOperationsUrl.mockReturnValue('https://host:9925/');

		const { url, headers, credentials } = resolveInstanceConnection({ id: 'ins-1' });

		expect(url).toBe('https://host:9925/');
		expect(headers.Authorization).toBeUndefined();
		expect(credentials).toBe('include');
	});

	it('routes a cluster through the fabric-connect proxy', () => {
		mockAuthStore.checkForFabricConnect.mockReturnValue(true);
		// Basic auth must be ignored on the proxy path (cookies are used instead).
		mockAuthStore.checkForBasicAuth.mockReturnValue({ username: 'admin', password: 'pw' });

		const { url, headers, credentials } = resolveInstanceConnection({ id: 'clu-abc' });

		expect(url).toBe('https://cm.example.com/Cluster/clu-abc/operation/');
		expect(headers.Authorization).toBeUndefined();
		expect(credentials).toBe('include');
	});

	it('routes an instance through the fabric-connect proxy', () => {
		mockAuthStore.checkForFabricConnect.mockReturnValue(true);

		const { url } = resolveInstanceConnection({ id: 'ins-xyz' });

		expect(url).toBe('https://cm.example.com/HDBInstance/ins-xyz/operation/');
	});

	it('honors an explicit operationsUrl with port/secure overrides', () => {
		const { url } = resolveInstanceConnection({
			id: 'ins-1',
			operationsUrl: 'https://host:9925',
			port: 9999,
			secure: false,
		});

		expect(url).toBe('http://host:9999/');
	});

	it('throws when no operations URL can be resolved', () => {
		mockAuthStore.getOperationsUrl.mockReturnValue(undefined);
		expect(() => resolveInstanceConnection({ id: 'ins-1' })).toThrow(/No operations URL/);
	});
});
