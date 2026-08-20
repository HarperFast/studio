import { mintOperationTokenWithCredentials } from '@/integrations/api/instance/auth/createInstanceAuthenticationTokens';
import { afterEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(body: unknown, init: { status?: number; statusText?: string } = {}): Response {
	const status = init.status ?? 200;
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: init.statusText ?? 'OK',
		json: () => Promise.resolve(body),
	} as unknown as Response;
}

describe('mintOperationTokenWithCredentials', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('POSTs the credentials directly (no cookies) and returns the operation token', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ operation_token: 'op-tok', refresh_token: 'r' }));
		vi.stubGlobal('fetch', fetchMock);

		const token = await mintOperationTokenWithCredentials({
			operationsUrl: 'https://host:9925/',
			username: 'admin',
			password: 'pw',
		});

		expect(token).toBe('op-tok');
		expect(fetchMock).toHaveBeenCalledWith('https://host:9925/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'omit',
			redirect: 'error',
			body: JSON.stringify({ operation: 'create_authentication_tokens', username: 'admin', password: 'pw' }),
		});
	});

	it('throws a credential-safe message on 401/403 without reflecting the password', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { status: 401, statusText: 'Unauthorized' })));
		await expect(
			mintOperationTokenWithCredentials({ operationsUrl: 'https://host:9925/', username: 'admin', password: 'pw' }),
		).rejects.toThrow('Those credentials were not accepted by this instance.');
	});

	it('throws when the instance returns no operation token', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ refresh_token: 'r' })));
		await expect(
			mintOperationTokenWithCredentials({ operationsUrl: 'https://host:9925/', username: 'admin', password: 'pw' }),
		).rejects.toThrow('did not return an operation token');
	});

	it('refuses to POST credentials to a non-direct (proxy) URL, without fetching', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		await expect(
			mintOperationTokenWithCredentials({
				operationsUrl: 'https://cm.example/HDBInstance/ins-1/operation',
				username: 'admin',
				password: 'pw',
			}),
		).rejects.toThrow('non-direct operations URL');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('surfaces a server-provided error message (200 or non-OK) instead of a generic one', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'account locked' }, { status: 200 })));
		await expect(
			mintOperationTokenWithCredentials({ operationsUrl: 'https://host:9925/', username: 'admin', password: 'pw' }),
		).rejects.toThrow('account locked');
	});
});
