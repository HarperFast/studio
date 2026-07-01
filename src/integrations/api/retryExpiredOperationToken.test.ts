/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';

const recoverExpiredOperationToken = vi.fn();
vi.mock('@/features/auth/store/authStore', () => ({
	authStore: { recoverExpiredOperationToken: (...args: unknown[]) => recoverExpiredOperationToken(...args) },
}));

const { curryRecoverExpiredOperationToken } = await import('./retryExpiredOperationToken');

function error401(config: Record<string, unknown> = { headers: {} }) {
	return { response: { status: 401 }, config };
}

describe('curryRecoverExpiredOperationToken', () => {
	afterEach(() => vi.clearAllMocks());

	it('mints a fresh token and replays the request once with the new Bearer header', async () => {
		recoverExpiredOperationToken.mockResolvedValue('fresh-token');
		const request = vi.fn().mockResolvedValue({ data: 'ok' });
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');
		const config = { headers: { Authorization: 'Bearer stale' } };

		const result = await handler(error401(config));

		expect(result).toEqual({ data: 'ok' });
		expect(recoverExpiredOperationToken).toHaveBeenCalledWith('ins-1');
		expect(request).toHaveBeenCalledTimes(1);
		const replayed = request.mock.calls[0][0];
		expect(replayed.headers.Authorization).toBe('Bearer fresh-token');
		expect(replayed.__triedOperationTokenRefresh).toBe(true);
	});

	it('rejects (no retry) when recovery yields no token', async () => {
		recoverExpiredOperationToken.mockResolvedValue(null);
		const request = vi.fn();
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');
		const err = error401();

		await expect(handler(err)).rejects.toBe(err);
		expect(request).not.toHaveBeenCalled();
	});

	it('does not recover a non-401 error', async () => {
		const request = vi.fn();
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');
		const err = { response: { status: 500 }, config: { headers: {} } };

		await expect(handler(err)).rejects.toBe(err);
		expect(recoverExpiredOperationToken).not.toHaveBeenCalled();
	});

	it('does not retry twice (guards against a loop when the fresh token is also rejected)', async () => {
		const request = vi.fn();
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');
		const err = error401({ headers: {}, __triedOperationTokenRefresh: true });

		await expect(handler(err)).rejects.toBe(err);
		expect(recoverExpiredOperationToken).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
	});
});
