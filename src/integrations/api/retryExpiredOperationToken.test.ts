/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';

const recoverExpiredOperationToken = vi.fn();
const getConnectionGeneration = vi.fn();
vi.mock('@/features/auth/store/authStore', () => ({
	authStore: {
		recoverExpiredOperationToken: (...args: unknown[]) => recoverExpiredOperationToken(...args),
		getConnectionGeneration: (...args: unknown[]) => getConnectionGeneration(...args),
	},
}));

const { curryRecoverExpiredOperationToken } = await import('./retryExpiredOperationToken');

function error401(config: Record<string, unknown> = { headers: {}, __connectionGeneration: 1 }) {
	return { response: { status: 401 }, config };
}

describe('curryRecoverExpiredOperationToken', () => {
	afterEach(() => vi.clearAllMocks());

	it('mints a fresh token and replays the request once', async () => {
		recoverExpiredOperationToken.mockResolvedValue('fresh-token');
		getConnectionGeneration.mockReturnValue(1);
		const request = vi.fn().mockResolvedValue({ data: 'ok' });
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');

		const result = await handler(error401());

		expect(result).toEqual({ data: 'ok' });
		expect(recoverExpiredOperationToken).toHaveBeenCalledWith('ins-1');
		expect(request).toHaveBeenCalledTimes(1);
		expect(request.mock.calls[0][0].__triedOperationTokenRefresh).toBe(true);
	});

	it('does not recover a request sent under a superseded connection', async () => {
		getConnectionGeneration.mockReturnValue(2);
		const request = vi.fn();
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');
		const err = error401({ headers: {}, __connectionGeneration: 1 });

		await expect(handler(err)).rejects.toBe(err);
		expect(recoverExpiredOperationToken).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
	});

	it('does not replay when the connection is replaced while recovery is in flight', async () => {
		getConnectionGeneration.mockReturnValueOnce(1).mockReturnValue(2);
		recoverExpiredOperationToken.mockResolvedValue('fresh-token');
		const request = vi.fn();
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');
		const err = error401();

		await expect(handler(err)).rejects.toBe(err);
		expect(recoverExpiredOperationToken).toHaveBeenCalledTimes(1);
		expect(request).not.toHaveBeenCalled();
	});

	it('rejects (no retry) when recovery yields no token', async () => {
		recoverExpiredOperationToken.mockResolvedValue(null);
		getConnectionGeneration.mockReturnValue(1);
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
		getConnectionGeneration.mockReturnValue(1);
		const request = vi.fn();
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');
		const err = error401({ headers: {}, __connectionGeneration: 1, __triedOperationTokenRefresh: true });

		await expect(handler(err)).rejects.toBe(err);
		expect(recoverExpiredOperationToken).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
	});
});
