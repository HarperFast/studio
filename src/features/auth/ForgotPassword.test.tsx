/**
 * @vitest-environment jsdom
 */
import { MutationCache, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post } }));

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => navigate,
	useSearch: () => ({}),
	Link: ({ children }: PropsWithChildren) => <a>{children}</a>,
}));

vi.mock('sonner', () => ({
	toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

import { toast } from 'sonner';
// The app's own mutation-error routing, not a copy: whether a CAPTCHA failure ALSO
// reaches the global toast is part of what's under test here.
import { mutationErrorHandler } from '@/react-query/queryClient';

// Stands in for Google's script: the hook mints through this module at submit time.
const { captchaState } = vi.hoisted(() => ({
	captchaState: { configured: true, token: undefined as string | undefined, mints: [] as string[] },
}));
vi.mock('@/lib/recaptcha/recaptchaScript', () => ({
	isCaptchaConfigured: () => captchaState.configured,
	warmCaptcha: vi.fn(),
	getCaptchaToken: async (action: string) => {
		captchaState.mints.push(action);
		return captchaState.token;
	},
}));

import { OUTCOME_UNKNOWN_MESSAGE, SERVER_ERROR_MESSAGE, SERVER_UNAVAILABLE_MESSAGE } from './describeAuthFailure';
import { OFFLINE_MESSAGE } from './failFastOffline';
import { ForgotPassword } from './ForgotPassword';
import {
	CAPTCHA_TOKEN_LIFETIME_MS,
	CHALLENGE_EXPIRED,
	CHALLENGE_FAILED,
	clearCaptchaFailures,
	useCaptchaChallenge,
} from './hooks/useCaptchaChallenge';

const captchaRejection = { isAxiosError: true, response: { status: 403, data: 'Verification failed' } } as AxiosError;
const serverError = { isAxiosError: true, response: { status: 500 } } as AxiosError;

type Settlers = { resolve: (value: unknown) => void; reject: (reason: unknown) => void };

let queryClient: QueryClient;

function wrapper() {
	queryClient = new QueryClient({
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}
	</QueryClientProvider>;
}

function renderForm() {
	const Wrapper = wrapper();
	return render(<ForgotPassword />, { wrapper: Wrapper });
}

async function submitWith(container: HTMLElement, email: string) {
	const input = container.querySelector('input[type="email"]')!;
	fireEvent.change(input, { target: { value: email } });
	fireEvent.submit(container.querySelector('form')!);
}

beforeEach(() => {
	captchaState.configured = true;
	captchaState.token = undefined;
	captchaState.mints = [];
	clearCaptchaFailures();
});

afterEach(() => vi.clearAllMocks());

describe('ForgotPassword — reCAPTCHA', () => {
	it('mints a forgot_password token at submit and sends it as captchaToken', async () => {
		captchaState.token = 'human-token';
		post.mockResolvedValue({ data: 'If an account exists with this email...' });
		const { container } = renderForm();

		await submitWith(container, 'user@example.com');

		await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
		expect(captchaState.mints).toEqual(['forgot_password']);
		expect(post).toHaveBeenCalledWith('/ForgotPassword/', {
			email: 'user@example.com',
			captchaToken: 'human-token',
		});
	});

	it('omits the field entirely when no token could be minted (enforcement still off)', async () => {
		captchaState.configured = false;
		post.mockResolvedValue({ data: 'If an account exists with this email...' });
		const { container } = renderForm();

		await submitWith(container, 'user@example.com');

		await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
		expect(post).toHaveBeenCalledWith('/ForgotPassword/', { email: 'user@example.com' });
		// toHaveBeenCalledWith treats explicit undefined as absent; assert it's gone.
		expect(post.mock.calls[0][1]).not.toHaveProperty('captchaToken');
	});

	it('on a 403 says what to change, inline', async () => {
		captchaState.token = 'rejected-token';
		post.mockRejectedValue(
			{ isAxiosError: true, response: { status: 403, data: 'Verification failed' } } as AxiosError,
		);
		const { container, findByRole } = renderForm();

		await submitWith(container, 'user@example.com');

		const alert = await findByRole('alert');
		expect(alert.textContent).toBe(CHALLENGE_FAILED);
	});

	it('names the real problem when the check never ran (script blocked, key configured)', async () => {
		captchaState.token = undefined; // configured, but the mint failed
		post.mockRejectedValue(
			{ isAxiosError: true, response: { status: 403, data: 'Verification failed' } } as AxiosError,
		);
		const { container, findByRole } = renderForm();

		await submitWith(container, 'user@example.com');

		const alert = await findByRole('alert');
		expect(alert.textContent).toContain('could not run the verification check');
	});

	it('clears the notice on the next submit, which mints a fresh token by design', async () => {
		captchaState.token = 'rejected-token';
		post.mockRejectedValueOnce(
			{ isAxiosError: true, response: { status: 403, data: 'Verification failed' } } as AxiosError,
		);
		const { container, findByRole, queryByRole } = renderForm();

		await submitWith(container, 'user@example.com');
		await findByRole('alert');

		captchaState.token = 'fresh-token';
		post.mockResolvedValue({ data: 'If an account exists with this email...' });
		await submitWith(container, 'user@example.com');

		await waitFor(() => expect(queryByRole('alert')).toBeNull());
		expect(post).toHaveBeenLastCalledWith('/ForgotPassword/', {
			email: 'user@example.com',
			captchaToken: 'fresh-token',
		});
		expect(captchaState.mints).toEqual(['forgot_password', 'forgot_password']);
	});

	it('offers support on its first refusal when sign-up was already refused twice', async () => {
		const signUp = renderHook(() => useCaptchaChallenge('signup'));
		act(() => {
			signUp.result.current.describeCaptchaError(captchaRejection);
			signUp.result.current.describeCaptchaError(captchaRejection);
		});
		signUp.unmount();

		captchaState.token = 'rejected-token';
		post.mockRejectedValue(captchaRejection);
		const { container, findByRole, getByRole } = renderForm();

		await submitWith(container, 'user@example.com');

		await findByRole('alert');
		expect(post).toHaveBeenCalledTimes(1);
		expect(getByRole('link', { name: 'Contact us' })).toBeTruthy();
	});

	it.each([
		['a sent reset link', 'success', (settle: Settlers) => settle.resolve({ data: 'If an account exists...' })],
		['a non-CAPTCHA failure', 'error', (settle: Settlers) => settle.reject(serverError)],
	])('starts the shared refusal count over after %s that lands once the form unmounted', async (
		_label,
		status,
		settleWith,
	) => {
		captchaState.token = 'rejected-token';
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		post.mockRejectedValueOnce(captchaRejection);
		const { container, findByRole, unmount } = renderForm();

		await submitWith(container, 'user@example.com');
		await findByRole('alert');

		let settlers: Settlers | undefined;
		post.mockReturnValueOnce(new Promise((resolve, reject) => (settlers = { resolve, reject })));
		await submitWith(container, 'user@example.com');
		await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
		unmount();
		settleWith(settlers!);
		await waitFor(() => expect(queryClient.getMutationCache().getAll().at(-1)?.state.status).toBe(status));
		consoleError.mockRestore();

		const nextForm = renderHook(() => useCaptchaChallenge('signup'));
		act(() => {
			nextForm.result.current.describeCaptchaError(captchaRejection);
		});
		expect(nextForm.result.current.supportSuggested).toBe(false);
	});

	it('shows a CAPTCHA 403 inline only — never also as a toast', async () => {
		captchaState.token = 'rejected-token';
		post.mockRejectedValue(
			{ isAxiosError: true, response: { status: 403, data: 'Verification failed' } } as AxiosError,
		);
		const { container, findByRole } = renderForm();

		await submitWith(container, 'user@example.com');

		await findByRole('alert');
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('classifies a mixed envelope by the field that names the cause, not the first string', async () => {
		// { error: 'Forbidden', message: 'Verification failed' } must still read as
		// a CAPTCHA rejection, or the ad-blocker guidance and support path vanish.
		captchaState.token = 'rejected-token';
		post.mockRejectedValue(
			{
				isAxiosError: true,
				response: { status: 403, data: { error: 'Forbidden', message: 'Verification failed' } },
			} as AxiosError,
		);
		const { container, findByRole } = renderForm();

		await submitWith(container, 'user@example.com');

		expect((await findByRole('alert')).textContent).toBe(CHALLENGE_FAILED);
	});

	it('renders a non-retryable 4xx inline in the server’s words, never as a toast', async () => {
		captchaState.token = 'human-token';
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		// Deliberately not a 404 "no such account": this page promises not to reveal whether an
		// address exists, so a fixture asserting that body would codify an enumeration oracle.
		post.mockRejectedValue(
			{ isAxiosError: true, response: { status: 400, data: 'That address is not valid' } } as AxiosError,
		);
		const { container, findByRole } = renderForm();

		await submitWith(container, 'user@example.com');

		expect((await findByRole('alert')).textContent).toBe('That address is not valid');
		expect(toast.error).not.toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it('does not report a CAPTCHA rejection, which the form states inline', async () => {
		captchaState.token = 'rejected-token';
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		post.mockRejectedValue(
			{ isAxiosError: true, response: { status: 403, data: 'Verification failed' } } as AxiosError,
		);
		const { container, findByRole } = renderForm();

		await submitWith(container, 'user@example.com');

		await findByRole('alert');
		expect(consoleError).not.toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it.each([
		['a non-CAPTCHA 403', { status: 403, data: 'Forbidden' }],
		['a non-retryable 4xx', { status: 400, data: 'That address is not valid' }],
		['a 503', { status: 503 }],
	])('reports %s to telemetry exactly once', async (_label, response) => {
		captchaState.token = 'human-token';
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		post.mockRejectedValue({ isAxiosError: true, response } as AxiosError);
		const { container, findByRole } = renderForm();

		await submitWith(container, 'user@example.com');

		await findByRole('alert');
		expect(consoleError).toHaveBeenCalledTimes(1);
		expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ isAxiosError: true }));
		consoleError.mockRestore();
	});

	// The caller's `mutate` callbacks are skipped once the form unmounts, which is exactly when
	// someone gave up on a slow request and navigated away.
	it('still reports a failure that settles after the form unmounted', async () => {
		captchaState.token = 'human-token';
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		let settle: (() => void) | undefined;
		post.mockReturnValue(
			new Promise((_resolve, reject) => {
				settle = () => reject({ isAxiosError: true, response: { status: 503 } } as AxiosError);
			}),
		);
		const { container, unmount } = renderForm();

		await submitWith(container, 'user@example.com');
		await waitFor(() => expect(post).toHaveBeenCalled());
		unmount();
		settle!();

		await waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ isAxiosError: true })));
		consoleError.mockRestore();
	});

	// The state model moved out of react-hook-form for exactly this: a `root` error survives a
	// resubmit the resolver rejects, and this form now routes every retryable failure inline, not
	// just CAPTCHA rejections.
	it('drops a stale server failure on a resubmit the resolver rejects', async () => {
		captchaState.token = 'human-token';
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		post.mockRejectedValue({ isAxiosError: true, response: { status: 503 } } as AxiosError);
		const { container, findByRole, queryByRole } = renderForm();

		await submitWith(container, 'user@example.com');
		await findByRole('alert');

		post.mockClear();
		await submitWith(container, 'not-an-email');

		// One call proves the resolver rejected the second submit rather than it re-failing.
		await waitFor(() => expect(queryByRole('alert')).toBeNull());
		expect(post).not.toHaveBeenCalled();
		consoleError.mockRestore();
	});

	// And forgot-password's has to be forgot-password's — see the sign-up counterpart.
	it('gives forgot-password’s own recovery when the outcome is unknown', async () => {
		captchaState.token = 'human-token';
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		post.mockRejectedValue({ isAxiosError: true, response: { status: 504 } } as AxiosError);
		const { container, findByRole } = renderForm();

		await submitWith(container, 'user@example.com');

		const alert = await findByRole('alert');
		expect(alert.textContent).toContain(OUTCOME_UNKNOWN_MESSAGE);
		expect(alert.textContent).toContain('Check your inbox before requesting another link.');
		expect(alert.textContent).not.toContain('verification link');
		consoleError.mockRestore();
	});

	it('offers support for a 500, which retrying may not clear', async () => {
		captchaState.token = 'human-token';
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		post.mockRejectedValue({ isAxiosError: true, response: { status: 500 } } as AxiosError);
		const { container, findByRole } = renderForm();

		await submitWith(container, 'user@example.com');

		const alert = await findByRole('alert');
		expect(alert.textContent).toContain(SERVER_ERROR_MESSAGE);
		expect(alert.textContent).toContain('if this keeps happening');
		consoleError.mockRestore();
	});

	it('reports a bodyless 503 inline, and still calls the RUM channel', async () => {
		captchaState.token = 'human-token';
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		post.mockRejectedValue({ isAxiosError: true, code: 'ERR_BAD_RESPONSE', response: { status: 503 } } as AxiosError);
		const { container, findByRole } = renderForm();

		await submitWith(container, 'user@example.com');

		expect((await findByRole('alert')).textContent).toBe(SERVER_UNAVAILABLE_MESSAGE);
		expect(toast.error).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ isAxiosError: true }));
		consoleError.mockRestore();
	});
});

describe('ForgotPassword — offline', () => {
	const networkError = { isAxiosError: true, code: 'ERR_NETWORK', message: 'Network Error' } as AxiosError;
	const submitButton = (container: HTMLElement) => container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
	let consoleError: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'debug').mockImplementation(() => {});
	});

	afterEach(() => {
		onlineManager.setOnline(true);
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('says it is offline and frees the form instead of hanging, then sends nothing when the connection returns', async () => {
		captchaState.token = 'human-token';
		post.mockRejectedValue(networkError);
		onlineManager.setOnline(false);
		const { container, findByRole } = renderForm();

		await submitWith(container, 'user@example.com');

		const alert = await findByRole('alert');
		expect(alert.textContent).toBe(OFFLINE_MESSAGE);
		expect(alert.textContent).not.toMatch(/VPN|proxy|ad blocker/);
		await waitFor(() => expect(submitButton(container).disabled).toBe(false));
		expect(toast.error).not.toHaveBeenCalled();
		// Being offline is not a Studio failure: `console.error` would file it in RUM.
		expect(consoleError).not.toHaveBeenCalled();

		onlineManager.setOnline(true);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(post).toHaveBeenCalledTimes(1);
	});

	// The mutation's own `onError` clears the count too, so this covers both places it could reset.
	it('keeps the refusal count across an offline submit, so the next refusal still offers support', async () => {
		captchaState.token = 'human-token';
		post.mockRejectedValueOnce(captchaRejection);
		const { container, getByRole, queryByRole } = renderForm();

		await submitWith(container, 'user@example.com');
		await waitFor(() => expect(getByRole('alert').textContent).toBe(CHALLENGE_FAILED));

		onlineManager.setOnline(false);
		post.mockRejectedValueOnce(networkError);
		await submitWith(container, 'user@example.com');
		await waitFor(() => expect(getByRole('alert').textContent).toBe(OFFLINE_MESSAGE));

		onlineManager.setOnline(true);
		post.mockRejectedValueOnce(captchaRejection);
		await submitWith(container, 'user@example.com');

		await waitFor(() => expect(getByRole('alert').textContent).toContain(CHALLENGE_FAILED));
		expect(post).toHaveBeenCalledTimes(3);
		expect(queryByRole('link', { name: 'Contact us' })).toBeTruthy();
	});

	it('mints a fresh token for the resubmit once back online', async () => {
		captchaState.token = 'offline-token';
		post.mockRejectedValueOnce(networkError);
		onlineManager.setOnline(false);
		const { container, findByRole, queryByRole } = renderForm();

		await submitWith(container, 'user@example.com');
		await findByRole('alert');

		onlineManager.setOnline(true);
		captchaState.token = 'fresh-token';
		post.mockResolvedValue({ data: 'If an account exists with this email...' });
		await submitWith(container, 'user@example.com');

		await waitFor(() => expect(queryByRole('alert')).toBeNull());
		expect(post).toHaveBeenLastCalledWith('/ForgotPassword/', {
			email: 'user@example.com',
			captchaToken: 'fresh-token',
		});
	});

	// Central manager refuses an expired token with the same 403 as a low score.
	it('says the check expired, not that a VPN is in the way, for a refusal after the token’s lifetime', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		captchaState.token = 'soon-stale-token';
		let refuse: (() => void) | undefined;
		post.mockReturnValue(new Promise((_resolve, reject) => (refuse = () => reject(captchaRejection))));
		const { container, findByRole, queryByRole } = renderForm();

		await submitWith(container, 'user@example.com');
		await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
		vi.setSystemTime(Date.now() + CAPTCHA_TOKEN_LIFETIME_MS);
		refuse!();

		const alert = await findByRole('alert');
		expect(alert.textContent).toBe(CHALLENGE_EXPIRED);
		expect(alert.textContent).not.toMatch(/VPN|proxy/);
		expect(queryByRole('link', { name: 'Contact us' })).toBeNull();
	});

	it('does not offer support for refusals of tokens that may have expired', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		captchaState.token = 'soon-stale-token';
		const { container, getByRole, queryByRole } = renderForm();

		for (let attempt = 1; attempt <= 2; attempt++) {
			let refuse: (() => void) | undefined;
			post.mockReturnValueOnce(new Promise((_resolve, reject) => (refuse = () => reject(captchaRejection))));
			await submitWith(container, 'user@example.com');
			await waitFor(() => expect(post).toHaveBeenCalledTimes(attempt));
			// The submit cleared the last alert, so the one awaited below is this attempt's.
			expect(queryByRole('alert')).toBeNull();
			vi.setSystemTime(Date.now() + CAPTCHA_TOKEN_LIFETIME_MS);
			refuse!();
			await waitFor(() => expect(getByRole('alert').textContent).toBe(CHALLENGE_EXPIRED));
		}

		// Two consecutive refusals would offer it, were these counted.
		expect(queryByRole('link', { name: 'Contact us' })).toBeNull();
	});
});
