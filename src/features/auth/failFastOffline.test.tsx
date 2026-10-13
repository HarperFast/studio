/**
 * @vitest-environment jsdom
 */
import { MutationCache, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { AxiosError, AxiosInstance } from 'axios';
import { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

const { post, put } = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post, put } }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), dismiss: vi.fn() } }));

// Instance sign-in asks the store which auth mode the entity uses before it sends anything.
vi.mock('@/features/auth/store/authStore', () => ({ authStore: { checkForBasicAuth: () => false } }));

import { useInstanceLoginMutation } from '@/integrations/api/instance/auth/useInstanceLoginMutation';
// The app's own routing, so a failure that also reached the global toast would show up here.
import { mutationErrorHandler } from '@/react-query/queryClient';
import { toast } from 'sonner';
import { failFastOffline, OFFLINE_TITLE, OfflineSubmitError } from './failFastOffline';
import { useForgotPasswordMutation } from './hooks/useForgotPassword';
import { useResendEmailVerification } from './hooks/useResendEmailVerification';
import { useResetPasswordMutation } from './hooks/useResetPassword';
import { useSignUpMutation } from './hooks/useSignUp';
import { useVerifyEmailMutation } from './hooks/useVerifyEmail';

// What axios rejects with when the browser fails the request before any response, as it does offline.
const networkError = { isAxiosError: true, code: AxiosError.ERR_NETWORK, message: 'Network Error' } as AxiosError;

const instancePost = vi.fn();
const instanceClient = { post: instancePost, defaults: {} } as unknown as AxiosInstance;

let consoleError: Mock;
let consoleDebug: Mock;

function wrapper({ children }: PropsWithChildren) {
	const client = new QueryClient({
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
		defaultOptions: { mutations: { retry: false } },
	});
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
	consoleError = vi.spyOn(console, 'error').mockImplementation(() => {}) as Mock;
	consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {}) as Mock;
});

afterEach(() => {
	onlineManager.setOnline(true);
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

describe('failFastOffline', () => {
	it('turns a request that failed while the browser was offline into an OfflineSubmitError', async () => {
		onlineManager.setOnline(false);
		const { mutationFn, networkMode } = failFastOffline(() => Promise.reject(networkError));

		const error = await mutationFn(undefined).catch((e: unknown) => e);

		expect(networkMode).toBe('always');
		expect(error).toBeInstanceOf(OfflineSubmitError);
		expect((error as OfflineSubmitError).cause).toBe(networkError);
	});

	// A connection that dropped after the request went out may have applied it: that keeps the
	// unknown-outcome copy.
	it('leaves a network failure alone when the browser was online at send, even if it is offline now', async () => {
		const { mutationFn } = failFastOffline(() => {
			onlineManager.setOnline(false);
			return Promise.reject(networkError);
		});

		await expect(mutationFn(undefined)).rejects.toBe(networkError);
	});

	// An offline browser fails the request at once; one held open until it timed out was out there.
	it.each([AxiosError.ECONNABORTED, AxiosError.ETIMEDOUT])('leaves a %s alone even while offline', async (code) => {
		onlineManager.setOnline(false);
		const timeout = { isAxiosError: true, code, message: 'timeout of 60000ms exceeded' } as AxiosError;
		const { mutationFn } = failFastOffline(() => Promise.reject(timeout));

		await expect(mutationFn(undefined)).rejects.toBe(timeout);
	});

	// Local Studio talks to its own instance over loopback, which answers with no network at all.
	it.each([
		['localhost', { baseURL: 'http://localhost:9925', url: '/' }],
		['127.0.0.1', { baseURL: 'http://127.0.0.1:9925/', url: '' }],
		['[::1]', { url: 'http://[::1]:9925/' }],
	])('leaves a failure from a %s target alone, since the offline flag says nothing about it', async (_host, config) => {
		onlineManager.setOnline(false);
		const failure = { ...networkError, config } as AxiosError;
		const { mutationFn } = failFastOffline(() => Promise.reject(failure));

		await expect(mutationFn(undefined)).rejects.toBe(failure);
	});

	it('still treats a remote target as offline', async () => {
		onlineManager.setOnline(false);
		const failure = { ...networkError, config: { baseURL: 'https://api.example.com', url: '/Login/' } } as AxiosError;
		const { mutationFn } = failFastOffline(() => Promise.reject(failure));

		await expect(mutationFn(undefined)).rejects.toBeInstanceOf(OfflineSubmitError);
	});

	it('leaves a server answer alone, whatever the browser says about the connection', async () => {
		onlineManager.setOnline(false);
		const refusal = { isAxiosError: true, response: { status: 400, data: 'Bad token' } } as AxiosError;
		const { mutationFn } = failFastOffline(() => Promise.reject(refusal));

		await expect(mutationFn(undefined)).rejects.toBe(refusal);
	});

	// `onlineManager` can be wrong, and paused mutations used to hide that: the request still goes.
	it('still sends, and succeeds, when the browser reports offline but the request gets through', async () => {
		onlineManager.setOnline(false);
		const { mutationFn } = failFastOffline(() => Promise.resolve('sent'));

		await expect(mutationFn(undefined)).resolves.toBe('sent');
	});
});

type Case = {
	request: Mock;
	useHook: () => { mutate: (variables: never) => void; isError: boolean; isPaused: boolean; error: unknown };
	variables: unknown;
	shownIn: 'form' | 'toast';
};

// Sign-in's mutation is private to `useCloudSignIn`; `SignIn.test.tsx` covers it through the form.
const cases: [string, Case][] = [
	['sign-up', {
		request: post,
		useHook: useSignUpMutation,
		variables: { email: 'ada@example.com', password: 'pw-12345678', firstname: 'Ada', lastname: 'Lovelace' },
		shownIn: 'form',
	}],
	['forgot password', {
		request: post,
		useHook: useForgotPasswordMutation,
		variables: { email: 'ada@example.com', captchaToken: 't' },
		shownIn: 'form',
	}],
	['reset password', {
		request: put,
		useHook: useResetPasswordMutation,
		variables: { token: 'reset-token', password: 'pw-12345678' },
		shownIn: 'toast',
	}],
	['email verification', {
		request: put,
		useHook: useVerifyEmailMutation,
		variables: { token: 'verify-token' },
		shownIn: 'toast',
	}],
	['resend verification email', {
		request: post,
		useHook: useResendEmailVerification,
		variables: { email: 'ada@example.com' },
		shownIn: 'toast',
	}],
	['cluster or instance sign-in', {
		request: instancePost,
		useHook: useInstanceLoginMutation,
		variables: { username: 'admin', password: 'pw', instanceClient, entityId: 'clu-1' },
		shownIn: 'toast',
	}],
];

describe('auth mutations while offline', () => {
	// `onlineManager`, not a `navigator.onLine` spy: React Query's default `networkMode` pauses on the
	// former, which is the hang this guards against (#1930).
	it.each(cases)('%s sends and fails at once instead of pausing, and queues nothing', async (_label, c) => {
		c.request.mockRejectedValue(networkError);
		onlineManager.setOnline(false);
		const { result } = renderHook(c.useHook, { wrapper });

		result.current.mutate(c.variables as never);

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.isPaused).toBe(false);
		expect(result.current.error).toBeInstanceOf(OfflineSubmitError);
		expect(c.request).toHaveBeenCalledTimes(1);

		onlineManager.setOnline(true);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(c.request).toHaveBeenCalledTimes(1);
	});

	// RUM collects `console.error`, and being offline is not a Studio failure (#1669).
	it.each(cases)('%s keeps an offline failure out of RUM and says it once', async (_label, c) => {
		c.request.mockRejectedValue(networkError);
		onlineManager.setOnline(false);
		const { result } = renderHook(c.useHook, { wrapper });

		result.current.mutate(c.variables as never);

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(consoleError).not.toHaveBeenCalled();
		expect(consoleDebug).toHaveBeenCalledWith(expect.any(String), expect.any(OfflineSubmitError));
		if (c.shownIn === 'toast') {
			expect(toast.error).toHaveBeenCalledTimes(1);
			expect(toast.error).toHaveBeenCalledWith(OFFLINE_TITLE, expect.objectContaining({ id: 'auth-offline' }));
			// Its Dismiss closes that toast only, not every toast on screen.
			const action = vi.mocked(toast.error).mock.calls[0][1]?.action as { onClick: (event: never) => void };
			action.onClick({} as never);
			expect(toast.dismiss).toHaveBeenCalledWith('auth-offline');
		} else {
			// Those forms say it inline (their own tests), so a toast would be a second copy.
			expect(toast.error).not.toHaveBeenCalled();
		}
	});

	// Opting out of the global toast to special-case offline must not change any other failure.
	it.each(cases.filter(([, c]) => c.shownIn === 'toast'))(
		'%s still toasts and reports an online failure exactly once, as before',
		async (_label, c) => {
			const refusal = { isAxiosError: true, response: { status: 400, data: 'Token expired' } } as AxiosError;
			c.request.mockRejectedValue(refusal);
			const { result } = renderHook(c.useHook, { wrapper });

			result.current.mutate(c.variables as never);

			await waitFor(() => expect(result.current.isError).toBe(true));
			expect(result.current.error).toBe(refusal);
			expect(toast.error).toHaveBeenCalledTimes(1);
			expect(toast.error).toHaveBeenCalledWith('Error', expect.objectContaining({ description: 'Token expired' }));
			expect(consoleError).toHaveBeenCalledTimes(1);
			expect(consoleError).toHaveBeenCalledWith(refusal);
		},
	);
});
