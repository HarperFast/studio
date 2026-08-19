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

	it('leaves a non-CAPTCHA failure to the normal error path (toast, no inline notice)', async () => {
		captchaState.token = 'human-token';
		post.mockRejectedValue(
			{ isAxiosError: true, response: { status: 500, data: 'boom' } } as AxiosError,
		);
		const { container, queryByRole } = renderForm();

		await submitWith(container, 'user@example.com');

		await waitFor(() => expect(post).toHaveBeenCalled());
		expect(queryByRole('alert')).toBeNull();
		await waitFor(() => expect(toast.error).toHaveBeenCalled());
	});
});
