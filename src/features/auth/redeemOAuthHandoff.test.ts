import { afterEach, describe, expect, it, vi } from 'vitest';
import { redeemOAuthHandoff } from './redeemOAuthHandoff';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe('redeemOAuthHandoff', () => {
	it('posts the code to the central manager with this page’s credentials', async () => {
		vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', 'https://cm.test.invalid/');
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await redeemOAuthHandoff('abc');

		expect(fetchMock).toHaveBeenCalledExactlyOnceWith('https://cm.test.invalid/oauth/handoff', {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ code: 'abc' }),
		});
	});

	it('rejects when the central manager refuses the code', async () => {
		vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', 'https://cm.test.invalid');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 })));

		await expect(redeemOAuthHandoff('abc')).rejects.toThrow('(400)');
	});
});
