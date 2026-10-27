/**
 * @vitest-environment jsdom
 */
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { AxiosError } from 'axios';
import { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

const { put } = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { put } }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), dismiss: vi.fn() } }));

// The app's own routing, so a failure that also reached the global toast would show up here.
import { mutationErrorHandler } from '@/react-query/queryClient';
import { toast } from 'sonner';
import { isVerifyEmailUnavailable, isVerifyEmailUnconfirmed, useVerifyEmailMutation } from './useVerifyEmail';

// The shape axios rejects with: `isUnansweredWrite` needs the request's `config`.
const verifyRequest = { method: 'put', url: '/VerifyEmail/' };

function axiosError(status: number, data?: unknown): AxiosError {
	return {
		isAxiosError: true,
		code: 'ERR_BAD_RESPONSE',
		message: `Request failed with status code ${status}`,
		config: verifyRequest,
		response: { status, data },
	} as AxiosError;
}

function unansweredError(code: string): AxiosError {
	return { isAxiosError: true, code, message: 'Network Error', config: verifyRequest } as AxiosError;
}

const unavailable = axiosError(503, { title: 'Verification could not start right now; retry with the same link' });

let consoleError: Mock;

function wrapper({ children }: PropsWithChildren) {
	// No `retry: false` default: the hook's own retry policy is what's under test.
	const client = new QueryClient({ mutationCache: new MutationCache({ onError: mutationErrorHandler }) });
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function startVerification() {
	const { result } = renderHook(() => useVerifyEmailMutation(), { wrapper });
	let settled!: Promise<unknown>;
	act(() => {
		settled = result.current.mutateAsync({ token: 'verify-token' }).catch((error: unknown) => error);
	});
	return settled;
}

async function advance(ms: number) {
	await act(() => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
	// mockReset, not the afterEach mockClear: a queued mockResolvedValueOnce would otherwise answer the next test.
	put.mockReset();
	vi.useFakeTimers();
	consoleError = vi.spyOn(console, 'error').mockImplementation(() => {}) as Mock;
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

describe('isVerifyEmailUnavailable', () => {
	it('matches central-manager’s 503', () => {
		expect(isVerifyEmailUnavailable(unavailable)).toBe(true);
	});

	it.each([401, 403, 500, 502, 504])('does not match a %i', (status) => {
		expect(isVerifyEmailUnavailable(axiosError(status))).toBe(false);
	});

	it('does not match a failure with no response, or a non-axios error', () => {
		expect(isVerifyEmailUnavailable(unansweredError(AxiosError.ERR_NETWORK))).toBe(false);
		expect(isVerifyEmailUnavailable(new Error('503'))).toBe(false);
		expect(isVerifyEmailUnavailable(undefined)).toBe(false);
	});
});

describe('isVerifyEmailUnconfirmed', () => {
	it.each([502, 503, 504])('matches a %i, which can follow a verify that landed', (status) => {
		expect(isVerifyEmailUnconfirmed(axiosError(status))).toBe(true);
	});

	it.each([AxiosError.ERR_NETWORK, AxiosError.ECONNABORTED, AxiosError.ETIMEDOUT])('matches %s', (code) => {
		expect(isVerifyEmailUnconfirmed(unansweredError(code))).toBe(true);
	});

	it.each([400, 401, 403, 500])('does not match a %i, which is a verdict', (status) => {
		expect(isVerifyEmailUnconfirmed(axiosError(status))).toBe(false);
	});

	it('does not match a non-axios error', () => {
		expect(isVerifyEmailUnconfirmed(new Error('504'))).toBe(false);
		expect(isVerifyEmailUnconfirmed(undefined)).toBe(false);
	});
});

describe('useVerifyEmailMutation', () => {
	it('sends the token as the body of PUT /VerifyEmail/', async () => {
		put.mockResolvedValue({ data: { userId: 'u1', email: 'ada@example.com', outcome: 'reset_email_sent' } });

		const settled = startVerification();
		await advance(0);

		expect(put).toHaveBeenCalledWith('/VerifyEmail/', { token: 'verify-token' });
		await expect(settled).resolves.toEqual({ userId: 'u1', email: 'ada@example.com', outcome: 'reset_email_sent' });
	});

	it('retries a 503 three times, 2s, 4s and 8s apart, and resolves with the answer that finally came', async () => {
		put
			.mockRejectedValueOnce(unavailable)
			.mockRejectedValueOnce(unavailable)
			.mockRejectedValueOnce(unavailable)
			.mockResolvedValueOnce({ data: { userId: 'u1', email: 'ada@example.com', outcome: 'reset_email_sent' } });

		const settled = startVerification();
		await advance(0);
		expect(put).toHaveBeenCalledTimes(1);
		await advance(1_999);
		expect(put).toHaveBeenCalledTimes(1);
		await advance(1);
		expect(put).toHaveBeenCalledTimes(2);
		await advance(3_999);
		expect(put).toHaveBeenCalledTimes(2);
		await advance(1);
		expect(put).toHaveBeenCalledTimes(3);
		await advance(7_999);
		expect(put).toHaveBeenCalledTimes(3);
		await advance(1);
		expect(put).toHaveBeenCalledTimes(4);

		await expect(settled).resolves.toMatchObject({ outcome: 'reset_email_sent' });
		expect(put.mock.calls.every(([, body]) => body.token === 'verify-token')).toBe(true);
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('gives up after the third retry, reports it, and leaves the 503 to the page instead of a toast', async () => {
		put.mockRejectedValue(unavailable);

		const settled = startVerification();
		await advance(2_000 + 4_000 + 8_000);
		expect(put).toHaveBeenCalledTimes(4);
		await advance(60_000);
		expect(put).toHaveBeenCalledTimes(4);

		await expect(settled).resolves.toBe(unavailable);
		expect(toast.error).not.toHaveBeenCalled();
		// Still reaches RUM: the page renders it inline, which would otherwise drop the report.
		expect(consoleError).toHaveBeenCalledWith(unavailable);
	});

	it.each([
		['a gateway 504', axiosError(504)],
		['no answer', unansweredError(AxiosError.ERR_NETWORK)],
	])('does not retry %s, and leaves it to the page instead of a toast', async (_case, rejection) => {
		put.mockRejectedValue(rejection);

		const settled = startVerification();
		await advance(60_000);

		expect(put).toHaveBeenCalledTimes(1);
		await expect(settled).resolves.toBe(rejection);
		expect(toast.error).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledWith(rejection);
	});

	it.each([
		['an invalid or expired token', 401, { title: 'Invalid or expired verify token' }],
		['an account that cannot be verified', 403, { title: 'Account cannot be verified' }],
	])('does not retry %s, and toasts it as before', async (_case, status, data) => {
		const rejection = axiosError(status, data);
		put.mockRejectedValue(rejection);

		const settled = startVerification();
		await advance(60_000);

		expect(put).toHaveBeenCalledTimes(1);
		await expect(settled).resolves.toBe(rejection);
		expect(toast.error).toHaveBeenCalledTimes(1);
	});
});
