import type { AxiosError } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { makeUnauthorizedResponseHandler } from './unauthorizedResponseHandler';

const errorWithStatus = (status?: number) =>
	({ response: status === undefined ? undefined : { status } }) as AxiosError;

describe('makeUnauthorizedResponseHandler', () => {
	it('clears auth on 401 and still rejects with the original error', async () => {
		const clearAuth = vi.fn();
		const error = errorWithStatus(401);
		await expect(makeUnauthorizedResponseHandler(clearAuth)(error)).rejects.toBe(error);
		expect(clearAuth).toHaveBeenCalledTimes(1);
	});

	it('does not clear auth on 403 (a legitimate permission denial)', async () => {
		const clearAuth = vi.fn();
		const error = errorWithStatus(403);
		await expect(makeUnauthorizedResponseHandler(clearAuth)(error)).rejects.toBe(error);
		expect(clearAuth).not.toHaveBeenCalled();
	});

	it('does not clear auth on a network error with no response', async () => {
		const clearAuth = vi.fn();
		const error = errorWithStatus(undefined);
		await expect(makeUnauthorizedResponseHandler(clearAuth)(error)).rejects.toBe(error);
		expect(clearAuth).not.toHaveBeenCalled();
	});

	it('passes through an undefined rejection reason without throwing', async () => {
		// An upstream interceptor could reject with a non-AxiosError (even undefined);
		// the handler must re-reject with it as-is, not with its own TypeError.
		const clearAuth = vi.fn();
		await expect(makeUnauthorizedResponseHandler(clearAuth)(undefined as unknown as AxiosError)).rejects.toBe(
			undefined,
		);
		expect(clearAuth).not.toHaveBeenCalled();
	});
});
