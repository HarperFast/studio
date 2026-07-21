/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCloudSignIn } from './useCloudSignIn';

// One shared apiClient mock backs both the login POST and the resend POST.
const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post } }));

// The hook only reaches for the router; give it inert doubles we can assert against.
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => navigate,
	useRouter: () => ({ invalidate: vi.fn() }),
	useSearch: () => ({}),
}));

vi.mock('sonner', () => ({
	toast: { info: vi.fn(), error: vi.fn().mockReturnValue({ dismiss: vi.fn() }), dismiss: vi.fn() },
}));

// onSuccess-only integrations — never exercised by these error-path tests, mocked to keep imports inert.
vi.mock('@/integrations/datadog/datadog', () => ({ loginSuccessDatadogAction: vi.fn() }));
vi.mock('@/integrations/reo/reo', () => ({ reoClient: { identify: vi.fn() } }));

import { apiClient } from '@/config/apiClient';
import { toast } from 'sonner';

const EMAIL = 'unverified@example.com';

function axiosError(status: number, data: unknown): AxiosError {
	return { isAxiosError: true, response: { status, data } } as AxiosError;
}

function wrapper() {
	const queryClient = new QueryClient({
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
		expect(toast.info).toHaveBeenCalled();
		// The dead-end "Error" toast must NOT fire for this case.
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('shows the standard error toast (no redirect, no resend) for invalid credentials', async () => {
		post.mockImplementation((url: string) =>
			url === '/Login/'
				? Promise.reject(axiosError(401, { error: 'Invalid email or password' }))
				: Promise.reject(new Error(`unexpected ${url}`))
		);

		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });
		act(() => result.current.submitForm({ email: EMAIL, password: 'wrong' }));

		await waitFor(() => expect(toast.error).toHaveBeenCalled());
		expect(navigate).not.toHaveBeenCalled();
		expect(apiClient.post).not.toHaveBeenCalledWith('/ResendVerificationEmail/', expect.anything());
	});
});
