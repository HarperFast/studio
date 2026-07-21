import type { AxiosError } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { makeUnauthorizedResponseHandler } from './unauthorizedResponseHandler';

const errorWithStatus = (status?: number, url?: string, config?: Record<string, unknown>) =>
	({
		response: status === undefined ? undefined : { status },
		config: config ?? (url === undefined ? undefined : { url }),
	}) as AxiosError;

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

	it('does not clear auth on a 401 from an exempt URL (unauthenticated auth flows)', async () => {
		// A stale reset/verify-email link opened in a second tab 401s with "bad
		// token" — that must not sign out a live session.
		const clearAuth = vi.fn();
		const isExempt = (url: string) => url.startsWith('/ResetPassword/');
		const error = errorWithStatus(401, '/ResetPassword/');
		await expect(makeUnauthorizedResponseHandler(clearAuth, isExempt)(error)).rejects.toBe(error);
		expect(clearAuth).not.toHaveBeenCalled();
	});

	it('clears auth on a 401 from a non-exempt URL', async () => {
		const clearAuth = vi.fn();
		const isExempt = (url: string) => url.startsWith('/ResetPassword/');
		const error = errorWithStatus(401, '/Organization/');
		await expect(makeUnauthorizedResponseHandler(clearAuth, isExempt)(error)).rejects.toBe(error);
		expect(clearAuth).toHaveBeenCalledTimes(1);
	});

	it('treats a 401 with no request config as non-exempt (fail toward sign-out)', async () => {
		const clearAuth = vi.fn();
		const isExempt = (url: string) => url.startsWith('/ResetPassword/');
		const error = errorWithStatus(401); // no config
		await expect(makeUnauthorizedResponseHandler(clearAuth, isExempt)(error)).rejects.toBe(error);
		expect(clearAuth).toHaveBeenCalledTimes(1);
	});

	describe('auth-generation guard (isStillCurrent)', () => {
		// Simulates the identity stamp: the request carries the user it was sent
		// under; the handler compares against whoever is current at response time.
		const handlerFor = (currentUserId: () => string | null, clearAuth = vi.fn()) => ({
			clearAuth,
			handler: makeUnauthorizedResponseHandler(
				clearAuth,
				() => false,
				(config) => (config as { authUserAtSend?: string | null } | undefined)?.authUserAtSend === currentUserId(),
			),
		});

		it('clears when the identity is unchanged since the request was sent (normal expiry)', async () => {
			const { clearAuth, handler } = handlerFor(() => 'userA');
			const error = errorWithStatus(401, undefined, { url: '/Organization/', authUserAtSend: 'userA' });
			await expect(handler(error)).rejects.toBe(error);
			expect(clearAuth).toHaveBeenCalledTimes(1);
		});

		it('does NOT clear when a re-login changed the identity (slow 401 from the old session)', async () => {
			// A expired → 401 handled → re-login as B. B's earlier in-flight request
			// (sent as A) now 401s; current identity is B, so it must be ignored.
			const { clearAuth, handler } = handlerFor(() => 'userB');
			const staleError = errorWithStatus(401, undefined, { url: '/Organization/', authUserAtSend: 'userA' });
			await expect(handler(staleError)).rejects.toBe(staleError);
			expect(clearAuth).not.toHaveBeenCalled();
		});
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
