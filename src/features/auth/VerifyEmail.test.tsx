/**
 * @vitest-environment jsdom
 */
import { MutationCache, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { PropsWithChildren, ReactNode, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { post, put } = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post, put } }));

// One navigate for the whole file, matching production's stable one: it sits in a dependency array.
const { navigate, search } = vi.hoisted(() => ({ navigate: vi.fn(), search: { token: undefined as unknown } }));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => navigate,
	useSearch: () => search,
	Link: ({ children, to, className }: PropsWithChildren<{ to?: string; className?: string }>) => (
		<a href={to} className={className}>{children}</a>
	),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() } }));

// The app's own routing, so a failure that also reached the global toast would show up here.
import { mutationErrorHandler } from '@/react-query/queryClient';
import { toast } from 'sonner';
import { OFFLINE_MESSAGE } from './failFastOffline';
import { VerifyEmail } from './VerifyEmail';

const UNCONFIRMED = /couldn't confirm your email was verified\. Your link still works/;

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

// `failFastOffline` reads a request to a loopback host as reachable offline, and jsdom's page is on localhost.
const offlineRejection = {
	isAxiosError: true,
	code: AxiosError.ERR_NETWORK,
	message: 'Network Error',
	config: { ...verifyRequest, baseURL: 'https://central-manager.example.com/' },
} as AxiosError;

function answer(outcome?: string) {
	return { data: { userId: 'u1', email: 'ada@example.com', ...(outcome === undefined ? {} : { outcome }) } };
}

let queryClient: QueryClient;

function page(): ReactNode {
	return (
		<QueryClientProvider client={queryClient}>
			<VerifyEmail />
		</QueryClientProvider>
	);
}

function signInLinks() {
	return {
		signIn: screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href'),
		forgotPassword: screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href'),
	};
}

beforeEach(() => {
	// mockReset, not the afterEach mockClear: a queued mockResolvedValueOnce would otherwise answer the next test.
	put.mockReset();
	post.mockReset();
	queryClient = new QueryClient({ mutationCache: new MutationCache({ onError: mutationErrorHandler }) });
	search.token = 'verify-token';
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

describe('VerifyEmail with a token', () => {
	// A central-manager that keeps the sign-up password answers without an outcome.
	it('sends a verify with no outcome to sign in, as before', async () => {
		put.mockResolvedValue(answer());
		render(page());

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));
		expect(put).toHaveBeenCalledWith('/VerifyEmail/', { token: 'verify-token' });
		expect(toast.success).toHaveBeenCalledWith(
			'Success',
			expect.objectContaining({ description: 'Email verified successfully' }),
		);
	});

	it('sends password_set to sign in', async () => {
		put.mockResolvedValue(answer('password_set'));
		render(page());

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));
		expect(toast.success).toHaveBeenCalledWith(
			'Success',
			expect.objectContaining({ description: 'Email verified successfully' }),
		);
	});

	// A repeat visit, after which the sign-up password may already have been replaced.
	it('stays on the page for already_verified, pointing at the set-password email, without claiming a password was saved', async () => {
		put.mockResolvedValue(answer('already_verified'));
		render(page());

		expect(await screen.findByRole('heading', { name: 'Already verified' })).toBeTruthy();
		const status = screen.getByRole('status').textContent ?? '';
		expect(status).toMatch(/If we emailed you a link to set your password, use it before signing in\./);
		expect(status).toMatch(/use Forgot Password/);
		expect(status).not.toMatch(/successfully|password (?:was|has been) (?:set|saved)/i);
		expect(signInLinks()).toEqual({ signIn: '/sign-in', forgotPassword: '/forgot-password' });
		expect(navigate).not.toHaveBeenCalled();
		expect(toast.success).not.toHaveBeenCalled();
	});

	it('stays on the page for reset_email_sent and says the sign-up password was replaced', async () => {
		put.mockResolvedValue(answer('reset_email_sent'));
		render(page());

		expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeTruthy();
		expect(screen.getByText(/the password you chose when signing up has been replaced/)).toBeTruthy();
		expect(screen.getByText('ada@example.com').tagName).toBe('STRONG');
		expect(screen.getByText('Check your inbox to set your password.')).toBeTruthy();
		expect(signInLinks()).toEqual({ signIn: '/sign-in', forgotPassword: '/forgot-password' });
		expect(navigate).not.toHaveBeenCalled();
		expect(toast.success).not.toHaveBeenCalled();
	});

	it('points password_reset_required at Forgot Password', async () => {
		put.mockResolvedValue(answer('password_reset_required'));
		render(page());

		expect(await screen.findByText('Set a new password to sign in.')).toBeTruthy();
		expect(screen.getByText(/couldn't send you a\s+link to set a new one\. Use Forgot Password to get one\./))
			.toBeTruthy();
		expect(signInLinks()).toEqual({ signIn: '/sign-in', forgotPassword: '/forgot-password' });
		expect(navigate).not.toHaveBeenCalled();
		expect(toast.success).not.toHaveBeenCalled();
	});

	it('treats an outcome it does not know as verified, with Forgot Password as the way back in', async () => {
		put.mockResolvedValue(answer('passkey_enrolled'));
		render(page());

		expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeTruthy();
		expect(screen.getByText("If your password doesn't work when you sign in, use Forgot Password to set a new one."))
			.toBeTruthy();
		expect(screen.queryByText(/has been replaced/)).toBeNull();
		expect(signInLinks()).toEqual({ signIn: '/sign-in', forgotPassword: '/forgot-password' });
		expect(navigate).not.toHaveBeenCalled();
	});

	it('shows "Verifying" before the first answer instead of flashing the resend form', () => {
		put.mockReturnValue(new Promise(() => {}));
		render(page());

		expect(screen.getByRole('status').textContent).toBe('Verifying email...');
		expect(screen.queryByRole('button', { name: 'Send Verification Email' })).toBeNull();
	});

	// Tokens are JWTs, which the router's JSON parse never turns into anything else.
	it.each([12345, 0, true, null])('treats a search value the router parsed into %s as no token', (value) => {
		search.token = value;
		render(page());

		expect(screen.getByRole('button', { name: 'Send Verification Email' })).toBeTruthy();
		expect(put).not.toHaveBeenCalled();
	});

	describe('submits once per token', () => {
		it('under StrictMode', async () => {
			put.mockResolvedValueOnce(answer('reset_email_sent')).mockResolvedValueOnce(answer('already_verified'));
			render(<StrictMode>{page()}</StrictMode>);

			expect(await screen.findByText('Check your inbox to set your password.')).toBeTruthy();
			expect(put).toHaveBeenCalledTimes(1);
			expect(navigate).not.toHaveBeenCalled();
		});

		it('across re-renders that change nothing', async () => {
			put.mockResolvedValue(answer('reset_email_sent'));
			const { rerender } = render(page());
			await screen.findByText('Check your inbox to set your password.');

			rerender(page());
			rerender(page());

			expect(put).toHaveBeenCalledTimes(1);
		});

		it('and again for a different token', async () => {
			put.mockResolvedValue(answer('reset_email_sent'));
			const { rerender } = render(page());
			await screen.findByText('Check your inbox to set your password.');

			search.token = 'another-token';
			rerender(page());

			await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
			expect(put).toHaveBeenLastCalledWith('/VerifyEmail/', { token: 'another-token' });
		});

		it('and sends a token that comes back after another, explaining the repeat answer', async () => {
			put.mockResolvedValueOnce(answer('reset_email_sent')).mockResolvedValueOnce(answer('reset_email_sent'))
				.mockResolvedValueOnce(answer('already_verified'));
			const { rerender } = render(page());
			await screen.findByText('Check your inbox to set your password.');
			search.token = 'another-token';
			rerender(page());
			await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
			await screen.findByText('Check your inbox to set your password.');

			search.token = 'verify-token';
			rerender(page());

			expect(await screen.findByRole('heading', { name: 'Already verified' })).toBeTruthy();
			expect(put).toHaveBeenLastCalledWith('/VerifyEmail/', { token: 'verify-token' });
			expect(navigate).not.toHaveBeenCalled();
		});

		it('and sends a token again when it comes back after none, so a failed one gets another try', async () => {
			put.mockRejectedValueOnce(axiosError(403, { title: 'Finish signing up before verifying your email' }))
				.mockResolvedValueOnce(answer('reset_email_sent'));
			const { rerender } = render(page());
			await screen.findByRole('button', { name: 'Send Verification Email' });

			search.token = undefined;
			rerender(page());
			search.token = 'verify-token';
			rerender(page());

			expect(await screen.findByText('Check your inbox to set your password.')).toBeTruthy();
			expect(put).toHaveBeenCalledTimes(2);
		});
	});

	describe('when central-manager answers 503', () => {
		// Past the last retry, with room for the failure to settle into state.
		async function exhaustRetries() {
			await act(() => vi.advanceTimersByTimeAsync(2_000 + 4_000 + 8_000 + 100));
		}

		beforeEach(() => {
			vi.useFakeTimers();
		});

		it('says the link still works and offers a retry instead of a new link, with no toast', async () => {
			put.mockRejectedValue(
				axiosError(503, { title: 'Verification could not start right now; retry with the same link' }),
			);
			render(page());
			await exhaustRetries();

			expect(put).toHaveBeenCalledTimes(4);
			expect(screen.getByRole('alert').textContent).toMatch(UNCONFIRMED);
			expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
			expect(screen.queryByRole('button', { name: 'Send Verification Email' })).toBeNull();
			expect(toast.error).not.toHaveBeenCalled();
		});

		// The first attempt may have landed before its answer was lost.
		it('explains a retry that finds the email already verified', async () => {
			put.mockRejectedValueOnce(axiosError(503)).mockResolvedValueOnce(answer('already_verified'));
			render(page());
			await act(() => vi.advanceTimersByTimeAsync(2_000 + 100));

			expect(put).toHaveBeenCalledTimes(2);
			expect(screen.getByRole('heading', { name: 'Already verified' })).toBeTruthy();
			expect(navigate).not.toHaveBeenCalled();
		});

		it('resubmits the same token on Try again', async () => {
			put.mockRejectedValue(axiosError(503));
			render(page());
			await exhaustRetries();

			put.mockReset();
			put.mockResolvedValue(answer('reset_email_sent'));
			await act(async () => {
				fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
			});
			await act(() => vi.advanceTimersByTimeAsync(100));

			expect(put).toHaveBeenCalledTimes(1);
			expect(put).toHaveBeenCalledWith('/VerifyEmail/', { token: 'verify-token' });
			expect(screen.getByText('Check your inbox to set your password.')).toBeTruthy();
		});

		it('shows "Verifying" while the retry is out', async () => {
			put.mockRejectedValue(axiosError(503));
			render(page());
			await exhaustRetries();

			put.mockReturnValue(new Promise(() => {}));
			await act(async () => {
				fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
			});
			await act(() => vi.advanceTimersByTimeAsync(100));

			expect(screen.getByRole('status').textContent).toBe('Verifying email...');
		});
	});

	it.each([
		['a gateway 502', axiosError(502)],
		['a gateway 504', axiosError(504)],
		['no answer', unansweredError(AxiosError.ERR_NETWORK)],
	])(
		'offers Try again for %s, which may follow a verify that landed, without retrying it',
		async (_case, rejection) => {
			put.mockRejectedValue(rejection);
			render(page());

			expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
			expect(screen.getByRole('alert').textContent).toMatch(UNCONFIRMED);
			expect(signInLinks()).toEqual({ signIn: '/sign-in', forgotPassword: '/forgot-password' });
			expect(put).toHaveBeenCalledTimes(1);
			expect(toast.error).not.toHaveBeenCalled();
		},
	);

	describe('sent while offline', () => {
		beforeEach(() => {
			vi.spyOn(console, 'debug').mockImplementation(() => {});
			onlineManager.setOnline(false);
		});

		afterEach(() => {
			onlineManager.setOnline(true);
		});

		it('says so and keeps the link, then resubmits the same token on Try again once back online', async () => {
			put.mockRejectedValueOnce(offlineRejection).mockResolvedValueOnce(answer('reset_email_sent'));
			render(page());

			expect((await screen.findByRole('alert')).textContent).toBe(OFFLINE_MESSAGE);
			expect(screen.queryByRole('button', { name: 'Send Verification Email' })).toBeNull();
			expect(signInLinks()).toEqual({ signIn: '/sign-in', forgotPassword: '/forgot-password' });
			expect(toast.error).not.toHaveBeenCalled();
			// Being offline is not a Studio failure: `console.error` would file it in RUM.
			expect(console.error).not.toHaveBeenCalled();

			onlineManager.setOnline(true);
			fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

			expect(await screen.findByText('Check your inbox to set your password.')).toBeTruthy();
			expect(put).toHaveBeenCalledTimes(2);
			expect(put).toHaveBeenLastCalledWith('/VerifyEmail/', { token: 'verify-token' });
		});

		it('says it is offline again for a retry that is still offline', async () => {
			put.mockRejectedValue(offlineRejection);
			render(page());
			fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

			await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
			expect((await screen.findByRole('alert')).textContent).toBe(OFFLINE_MESSAGE);
			expect(toast.error).not.toHaveBeenCalled();
		});
	});

	it('ignores a late success for a token the route has since dropped', async () => {
		let resolve!: (value: unknown) => void;
		put.mockReturnValue(new Promise((r) => (resolve = r)));
		const { rerender } = render(page());
		await waitFor(() => expect(put).toHaveBeenCalledTimes(1));

		search.token = undefined;
		rerender(page());
		await act(async () => resolve(answer()));

		expect(screen.getByRole('button', { name: 'Send Verification Email' })).toBeTruthy();
		expect(navigate).not.toHaveBeenCalled();
		expect(toast.success).not.toHaveBeenCalled();
	});

	it.each([
		['an invalid or expired link', 401, { title: 'Invalid or expired verify token' }],
		['an account still signing up', 403, { title: 'Finish signing up before verifying your email' }],
	])('toasts %s and falls back to requesting a new link, as before', async (_case, status, data) => {
		put.mockRejectedValue(axiosError(status, data));
		render(page());

		expect(await screen.findByRole('button', { name: 'Send Verification Email' })).toBeTruthy();
		expect(toast.error).toHaveBeenCalledTimes(1);
		expect(put).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
	});
});

describe('VerifyEmail without a token', () => {
	it('asks for an address to send a new link to, and verifies nothing', () => {
		search.token = undefined;
		render(page());

		expect(screen.getByText('Enter your email to receive a verification link.')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Send Verification Email' })).toBeTruthy();
		expect(put).not.toHaveBeenCalled();
	});
});
