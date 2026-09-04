/**
 * @vitest-environment jsdom
 */
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCloudSignIn } from './useCloudSignIn';

// One shared apiClient mock backs both the login POST and the resend POST.
const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post } }));

// The hook only reaches for the router; give it inert doubles we can assert against.
// One router object for the whole file, matching production's stable one.
const { navigate, router } = vi.hoisted(() => ({ navigate: vi.fn(), router: { invalidate: vi.fn() } }));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => navigate,
	useRouter: () => router,
	useSearch: () => ({}),
}));

vi.mock('sonner', () => ({
	toast: { info: vi.fn(), error: vi.fn().mockReturnValue({ dismiss: vi.fn() }), dismiss: vi.fn() },
}));

// onSuccess-only integrations — never exercised by these error-path tests, mocked to keep imports inert.
vi.mock('@/integrations/datadog/datadog', () => ({ loginSuccessDatadogAction: vi.fn() }));
vi.mock('@/integrations/reo/reo', () => ({ reoClient: { identify: vi.fn() } }));

import { apiClient } from '@/config/apiClient';
import { mutationErrorHandler } from '@/react-query/queryClient';
import { toast } from 'sonner';
import { OUTCOME_UNKNOWN_MESSAGE, SERVER_UNAVAILABLE_MESSAGE } from '../describeAuthFailure';

const EMAIL = 'unverified@example.com';

function axiosError(status: number, data?: unknown): AxiosError {
	return { isAxiosError: true, code: 'ERR_BAD_RESPONSE', response: { status, data } } as AxiosError;
}

function wrapper() {
	// The app's own routing, not a copy: without it `toast.error` can never fire and the
	// "reported inline, not as a toast" assertions below hold no matter what the hook does.
	const queryClient = new QueryClient({
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}
	</QueryClientProvider>;
}

afterEach(() => vi.clearAllMocks());

describe('useCloudSignIn — unverified email', () => {
	it('resends verification, redirects to /verifying, and suppresses the generic error toast', async () => {
		post.mockImplementation((url: string) => {
			if (url === '/Login/') {
				return Promise.reject(axiosError(403, { error: 'User has not verified email address' }));
			}
			if (url === '/ResendVerificationEmail/') { return Promise.resolve({ data: { email: EMAIL } }); }
			return Promise.reject(new Error(`unexpected ${url}`));
		});

		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });
		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/verifying?email=unverified%40example.com' }));
		expect(apiClient.post).toHaveBeenCalledWith('/ResendVerificationEmail/', { email: EMAIL });
		// The "we sent a link" toast only fires once the resend actually succeeds.
		await waitFor(() => expect(toast.info).toHaveBeenCalled());
		// The dead-end "Error" toast must NOT fire for this case.
		expect(toast.error).not.toHaveBeenCalled();
	});

	// The redirect is the success path for this rejection; filing it would put every unverified
	// sign-in into Error Tracking.
	it('does not report the unverified-email rejection', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		post.mockImplementation((url: string) =>
			url === '/Login/'
				? Promise.reject(axiosError(403, { error: 'User has not verified email address' }))
				: Promise.resolve({ data: { email: EMAIL } })
		);

		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });
		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(consoleError).not.toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it('still redirects (without claiming a link was sent) when the resend fails', async () => {
		post.mockImplementation((url: string) => {
			if (url === '/Login/') {
				return Promise.reject(axiosError(403, { error: 'User has not verified email address' }));
			}
			// Resend fails (e.g. rate-limited) — the user must still reach /verifying, and we must
			// NOT show a "we sent a link" toast that never happened.
			return Promise.reject(axiosError(429, { error: 'Too many requests' }));
		});

		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });
		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/verifying?email=unverified%40example.com' }));
		await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/ResendVerificationEmail/', { email: EMAIL }));
		expect(toast.info).not.toHaveBeenCalled();
	});

	it("reports invalid credentials as the server worded them, and doesn't redirect or resend", async () => {
		post.mockImplementation((url: string) =>
			url === '/Login/'
				? Promise.reject(axiosError(401, { error: 'Invalid email or password' }))
				: Promise.reject(new Error(`unexpected ${url}`))
		);

		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });
		act(() => result.current.submitForm({ email: EMAIL, password: 'wrong' }));

		await waitFor(() => expect(result.current.submitError).toBe('Invalid email or password'));
		expect(toast.error).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
		expect(apiClient.post).not.toHaveBeenCalledWith('/ResendVerificationEmail/', expect.anything());
	});
});

describe('useCloudSignIn — retryable failures', () => {
	it('tells the user a bodyless 503 is worth reattempting, and still reports it', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		post.mockImplementation(() => Promise.reject(axiosError(503)));

		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });
		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		await waitFor(() => expect(result.current.submitError).toBe(SERVER_UNAVAILABLE_MESSAGE));
		expect(navigate).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ isAxiosError: true }));
		consoleError.mockRestore();
	});

	// React Query skips a `mutate` callback when the component unmounted mid-flight, so a report
	// living there is lost exactly when someone gives up and navigates away.
	it('still reports a rejection when the form unmounts before it settles', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		let reject: ((err: unknown) => void) | undefined;
		post.mockImplementation(() =>
			new Promise((_resolve, rej) => {
				reject = rej;
			})
		);

		const { result, unmount } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });
		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));
		await waitFor(() => expect(post).toHaveBeenCalled());
		unmount();
		await act(async () => {
			reject!(axiosError(503));
			await Promise.resolve();
		});

		await waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ isAxiosError: true })));
		consoleError.mockRestore();
	});

	// Sign-in supplies its own recovery, because a login is the one of the three that is safe to
	// simply repeat.
	it('reports a transport failure as an unknown outcome, with sign-in’s own recovery', async () => {
		post.mockImplementation(() => Promise.reject({ isAxiosError: true, code: 'ERR_NETWORK' } as AxiosError));

		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });
		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		await waitFor(() => expect(result.current.submitError).toBe(`${OUTCOME_UNKNOWN_MESSAGE} Try signing in again.`));
	});

	it('clears the previous failure when the form is resubmitted', async () => {
		post.mockImplementationOnce(() => Promise.reject(axiosError(503)));

		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });
		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));
		await waitFor(() => expect(result.current.submitError).toBe(SERVER_UNAVAILABLE_MESSAGE));

		post.mockImplementationOnce(() => Promise.resolve({ data: { id: 'usr-1', email: EMAIL, roles: {} } }));
		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		await waitFor(() => expect(result.current.submitError).toBeUndefined());
	});
});
