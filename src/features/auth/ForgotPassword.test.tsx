/**
 * @vitest-environment jsdom
 */
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react';
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

import { SERVER_ERROR_MESSAGE, SERVER_UNAVAILABLE_MESSAGE } from './describeAuthFailure';
import { ForgotPassword } from './ForgotPassword';

function wrapper() {
	const queryClient = new QueryClient({
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

	it('on a 403 shows the try-again notice inline', async () => {
		captchaState.token = 'rejected-token';
		post.mockRejectedValue(
			{ isAxiosError: true, response: { status: 403, data: 'Verification failed' } } as AxiosError,
		);
		const { container, findByRole } = renderForm();

		await submitWith(container, 'user@example.com');

		const alert = await findByRole('alert');
		expect(alert.textContent).toContain('Verification failed. Please try again.');
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

		expect((await findByRole('alert')).textContent).toContain('Verification failed. Please try again.');
	});

	it('leaves a non-retryable failure to the normal error path (toast, no inline notice)', async () => {
		captchaState.token = 'human-token';
		// Deliberately not a 404 "no such account": this page promises not to reveal whether an
		// address exists, so a fixture asserting that body would codify an enumeration oracle.
		post.mockRejectedValue(
			{ isAxiosError: true, response: { status: 400, data: 'That address is not valid' } } as AxiosError,
		);
		const { container, queryByRole } = renderForm();

		await submitWith(container, 'user@example.com');

		await waitFor(() => expect(post).toHaveBeenCalled());
		expect(queryByRole('alert')).toBeNull();
		await waitFor(() => expect(toast.error).toHaveBeenCalled());
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
