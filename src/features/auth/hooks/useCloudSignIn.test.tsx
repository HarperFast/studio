/**
 * @vitest-environment jsdom
 */
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloudSignIn, useCompleteCloudSignIn } from './useCloudSignIn';

// One shared apiClient mock backs both the login POST and the resend POST.
const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post } }));

// The hook only reaches for the router; give it inert doubles we can assert against.
// One router object for the whole file, matching production's stable one.
const { navigate, router, hashSearch, historyState } = vi.hoisted(() => ({
	navigate: vi.fn(),
	router: { invalidate: vi.fn() },
	hashSearch: { current: {} as Record<string, unknown> },
	historyState: { current: {} as { finishesEmailedLink?: boolean } },
}));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => navigate,
	useRouter: () => router,
	useSearch: () => hashSearch.current,
	useLocation: ({ select }: { select: (location: { state: typeof historyState.current }) => unknown }) =>
		select({ state: historyState.current }),
}));

vi.mock('sonner', () => ({
	toast: { info: vi.fn(), error: vi.fn().mockReturnValue({ dismiss: vi.fn() }), dismiss: vi.fn() },
}));

// onSuccess-only integrations — never exercised by these error-path tests, mocked to keep imports inert.
vi.mock('@/integrations/datadog/datadog', () => ({ loginSuccessDatadogAction: vi.fn() }));
vi.mock('@/integrations/reo/reo', () => ({ reoClient: { identify: vi.fn() } }));

import { apiClient } from '@/config/apiClient';
import { keepSignInRedirect, readSignInRedirect } from '@/features/auth/pendingSignInRedirect';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import type { User } from '@/integrations/api/api.patch';
import { loginSuccessDatadogAction } from '@/integrations/datadog/datadog';
import { mutationErrorHandler, queryClient as appQueryClient } from '@/react-query/queryClient';
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

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/verifying', state: { prefillEmail: EMAIL } }));
		expect(apiClient.post).toHaveBeenCalledWith('/ResendVerificationEmail/', { email: EMAIL });
		// The "we sent a link" toast only fires once the resend actually succeeds.
		await waitFor(() => expect(toast.info).toHaveBeenCalled());
		// The dead-end "Error" toast must NOT fire for this case.
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('keeps the redirect on the way to /verifying', async () => {
		const mcpAuthorize = '/oauth/mcp/authorize?response_type=code&client_id=c&state=s';
		hashSearch.current = { redirect: mcpAuthorize };
		post.mockImplementation((url: string) =>
			url === '/Login/'
				? Promise.reject(axiosError(403, { error: 'User has not verified email address' }))
				: Promise.resolve({ data: { email: EMAIL } })
		);

		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });
		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		await waitFor(() =>
			expect(navigate).toHaveBeenCalledWith({
				to: '/verifying',
				search: { redirect: mcpAuthorize },
				state: { prefillEmail: EMAIL },
			})
		);
		hashSearch.current = {};
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

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/verifying', state: { prefillEmail: EMAIL } }));
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

// The verify page lets a signed-in visitor in, and the session central-manager opens for the verified account has
// replaced theirs in this browser.
describe('useCompleteCloudSignIn — taking in a different account', () => {
	const ADA = { id: 'usr-ada', email: 'ada@example.com', roles: {} } as unknown as User;
	const GRACE = { id: 'usr-grace', email: 'grace@example.com', roles: {} } as unknown as User;

	function appWrapper({ children }: PropsWithChildren) {
		return <QueryClientProvider client={appQueryClient}>{children}</QueryClientProvider>;
	}

	function resetApp() {
		authStore.signOutAllLocally();
		appQueryClient.clear();
	}

	beforeEach(resetApp);
	afterEach(() => {
		resetApp();
		vi.restoreAllMocks();
	});

	it('clears the previous account’s cached data before taking in another account', async () => {
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });
		await act(() => result.current(ADA));
		appQueryClient.setQueryData(['ada-only'], 'ada data');
		const instanceSignOut = vi.spyOn(authStore, 'signOutFromPotentiallyAuthenticatedInstances');

		await act(() => result.current(GRACE));

		expect(instanceSignOut).toHaveBeenCalledTimes(1);
		expect(appQueryClient.getQueryData(['ada-only'])).toBeUndefined();
		expect(authStore.getConnectionById(OverallAppSignIn).user).toBe(GRACE);
		expect(navigate).toHaveBeenCalledTimes(2);
	});

	it('does not take in the new account when a sign-out lands while the old one’s logouts are out', async () => {
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });
		await act(() => result.current(ADA));
		let finishLogouts!: () => void;
		vi.spyOn(authStore, 'signOutFromPotentiallyAuthenticatedInstances').mockReturnValue(
			new Promise<void>((resolve) => (finishLogouts = resolve)),
		);

		let entered: Promise<boolean> | undefined;
		act(() => {
			entered = result.current(GRACE);
		});
		authStore.signOutAllLocally();
		finishLogouts();

		await expect(entered).resolves.toBe(false);
		expect(authStore.getConnectionById(OverallAppSignIn).user).toBeNull();
		expect(navigate).toHaveBeenCalledTimes(1);
	});

	it('keeps the cache when the same account is taken in again', async () => {
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });
		await act(() => result.current(ADA));
		appQueryClient.setQueryData(['ada-only'], 'ada data');
		const instanceSignOut = vi.spyOn(authStore, 'signOutFromPotentiallyAuthenticatedInstances');

		await act(() => result.current(ADA));

		expect(instanceSignOut).not.toHaveBeenCalled();
		expect(appQueryClient.getQueryData(['ada-only'])).toBe('ada data');
	});
});

describe('useCompleteCloudSignIn — redirect', () => {
	const ADA = { id: 'usr-ada', email: 'ada@example.com', roles: {} } as unknown as User;
	const replace = vi.fn();

	function appWrapper({ children }: PropsWithChildren) {
		return <QueryClientProvider client={appQueryClient}>{children}</QueryClientProvider>;
	}

	beforeEach(() => {
		authStore.signOutAllLocally();
		appQueryClient.clear();
		vi.stubGlobal('location', { ...window.location, replace });
	});
	afterEach(() => {
		hashSearch.current = {};
		authStore.signOutAllLocally();
		appQueryClient.clear();
		vi.unstubAllGlobals();
	});

	it('replaces the sign-in page with the MCP authorization', async () => {
		const mcpAuthorize = '/oauth/mcp/authorize?response_type=code&client_id=c&state=s';
		hashSearch.current = { redirect: mcpAuthorize };
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await expect(act(() => result.current(ADA))).resolves.toBe(true);

		expect(replace).toHaveBeenCalledExactlyOnceWith(mcpAuthorize);
		expect(navigate).not.toHaveBeenCalled();
		expect(authStore.getConnectionById(OverallAppSignIn).user).toBe(ADA);
	});

	// As `href`: `to` is a pathname, whose normalization turns the query's `https://` into `https:/`.
	it('navigates to an in-app redirect, keeping its own query', async () => {
		const deploy = '/org-1/clu-1/config/deploy-from-github?repository=https://github.com/Acme/shop.git';
		hashSearch.current = { redirect: deploy };
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await act(() => result.current(ADA));

		expect(navigate).toHaveBeenCalledExactlyOnceWith({ href: deploy });
		expect(replace).not.toHaveBeenCalled();
	});

	it('follows the redirect its page hands it over the page search', async () => {
		const mcpAuthorize = '/oauth/mcp/authorize?response_type=code&state=s';
		hashSearch.current = { redirect: `${mcpAuthorize}?error=access_denied` };
		const { result } = renderHook(() => useCompleteCloudSignIn({ redirect: mcpAuthorize }), { wrapper: appWrapper });

		await act(() => result.current(ADA));

		expect(replace).toHaveBeenCalledExactlyOnceWith(mcpAuthorize);
	});

	it('gives up, without following the redirect, when another sign-in lands meanwhile', async () => {
		const GRACE = { id: 'usr-grace', email: 'grace@example.com', roles: {} } as unknown as User;
		hashSearch.current = { redirect: '/oauth/mcp/authorize?response_type=code&state=s' };
		vi.spyOn(appQueryClient, 'invalidateQueries').mockImplementationOnce(async () => {
			authStore.setUserForEntity(OverallAppSignIn, GRACE);
		});
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await expect(act(() => result.current(ADA))).resolves.toBe(false);

		expect(replace).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	it('still follows it when the sign-in bookkeeping throws', async () => {
		const mcpAuthorize = '/oauth/mcp/authorize?response_type=code&state=s';
		hashSearch.current = { redirect: mcpAuthorize };
		const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		vi.mocked(loginSuccessDatadogAction).mockImplementationOnce(() => {
			throw new Error('analytics script failed');
		});
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await act(() => result.current(ADA));

		expect(replace).toHaveBeenCalledExactlyOnceWith(mcpAuthorize);
		expect(consoleDebug).toHaveBeenCalledWith('Sign-in bookkeeping failed, carrying on:', expect.any(Error));
		consoleDebug.mockRestore();
	});

	it.each([
		['another host', 'https://evil.example/oauth/mcp/authorize'],
		['a protocol-relative host', '//evil.example'],
		['a value that is not text', 404],
	])('falls back to the default route for %s', async (_label, redirect) => {
		hashSearch.current = { redirect };
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await act(() => result.current(ADA));

		expect(replace).not.toHaveBeenCalled();
		expect(navigate).toHaveBeenCalledTimes(1);
		expect(navigate.mock.calls[0][0]).toEqual({ to: expect.not.stringContaining('evil') });
	});
});

describe('useCompleteCloudSignIn — a target kept across an emailed link', () => {
	const ADA = { id: 'usr-ada', email: 'ada@example.com', roles: {} } as unknown as User;
	const GRACE = { id: 'usr-grace', email: 'grace@example.com', roles: {} } as unknown as User;
	const mcpAuthorize = '/oauth/mcp/authorize?response_type=code&client_id=c&state=s';
	const replace = vi.fn();

	function appWrapper({ children }: PropsWithChildren) {
		return <QueryClientProvider client={appQueryClient}>{children}</QueryClientProvider>;
	}

	beforeEach(() => {
		authStore.signOutAllLocally();
		appQueryClient.clear();
		localStorage.clear();
		vi.stubGlobal('location', { ...window.location, replace });
	});
	afterEach(() => {
		hashSearch.current = {};
		authStore.signOutAllLocally();
		appQueryClient.clear();
		localStorage.clear();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('continues to it when it finishes an emailed flow and the page has no target, and forgets it', async () => {
		keepSignInRedirect('Ada@Example.com', mcpAuthorize);
		const { result } = renderHook(() => useCompleteCloudSignIn({ followKept: true }), { wrapper: appWrapper });

		await expect(act(() => result.current(ADA))).resolves.toBe(true);

		expect(replace).toHaveBeenCalledExactlyOnceWith(mcpAuthorize);
		expect(readSignInRedirect('ada@example.com')?.redirect).toBeUndefined();
	});

	it('leaves it alone for a completion that finishes no emailed flow', async () => {
		keepSignInRedirect('ada@example.com', mcpAuthorize);
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await act(() => result.current(ADA));

		expect(replace).not.toHaveBeenCalled();
		expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: expect.any(String) });
		expect(readSignInRedirect('ada@example.com')?.redirect).toBe(mcpAuthorize);
	});

	it('leaves another address’s target alone', async () => {
		keepSignInRedirect('grace@example.com', mcpAuthorize);
		const { result } = renderHook(() => useCompleteCloudSignIn({ followKept: true }), { wrapper: appWrapper });

		await act(() => result.current(ADA));

		expect(replace).not.toHaveBeenCalled();
		expect(readSignInRedirect('grace@example.com')?.redirect).toBe(mcpAuthorize);
	});

	it('prefers the page’s own target, and keeps a different one for its own flow', async () => {
		keepSignInRedirect('ada@example.com', mcpAuthorize);
		hashSearch.current = { redirect: '/org-1/clu-1/usage' };
		const { result } = renderHook(() => useCompleteCloudSignIn({ followKept: true }), { wrapper: appWrapper });

		await act(() => result.current(ADA));

		expect(navigate).toHaveBeenCalledExactlyOnceWith({ href: '/org-1/clu-1/usage' });
		expect(replace).not.toHaveBeenCalled();
		expect(readSignInRedirect('ada@example.com')?.redirect).toBe(mcpAuthorize);
	});

	it('forgets it when the page carries the same target', async () => {
		keepSignInRedirect('ada@example.com', mcpAuthorize);
		hashSearch.current = { redirect: mcpAuthorize };
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await act(() => result.current(ADA));

		expect(replace).toHaveBeenCalledExactlyOnceWith(mcpAuthorize);
		expect(readSignInRedirect('ada@example.com')?.redirect).toBeUndefined();
	});

	it('keeps it when the completion gives up', async () => {
		keepSignInRedirect('ada@example.com', mcpAuthorize);
		vi.spyOn(appQueryClient, 'invalidateQueries').mockImplementationOnce(async () => {
			authStore.setUserForEntity(OverallAppSignIn, GRACE);
		});
		const { result } = renderHook(() => useCompleteCloudSignIn({ followKept: true }), { wrapper: appWrapper });

		await expect(act(() => result.current(ADA))).resolves.toBe(false);

		expect(replace).not.toHaveBeenCalled();
		expect(readSignInRedirect('ada@example.com')?.redirect).toBe(mcpAuthorize);
	});

	// Clearing the previous account wipes localStorage, so the kept target has to be read before it.
	it('still continues to it when the browser held another account', async () => {
		const { result } = renderHook(() => useCompleteCloudSignIn({ followKept: true }), { wrapper: appWrapper });
		await act(() => result.current(GRACE));
		navigate.mockClear();
		keepSignInRedirect('ada@example.com', mcpAuthorize);

		await expect(act(() => result.current(ADA))).resolves.toBe(true);

		expect(authStore.getConnectionById(OverallAppSignIn).user).toBe(ADA);
		expect(replace).toHaveBeenCalledExactlyOnceWith(mcpAuthorize);
		expect(readSignInRedirect('ada@example.com')).toBeUndefined();
	});

	// A sign-out's own wipe takes the kept target too; giving up must not write it back after that wipe.
	it.each([
		['a sign-out', () => authStore.signOutAllLocally()],
		[
			'another sign-in',
			() => authStore.setUserForEntity(OverallAppSignIn, { ...GRACE, id: 'usr-other' } as unknown as User),
		],
	])('doesn’t put back what the previous account’s wipe took when %s lands meanwhile', async (_label, land) => {
		const { result } = renderHook(() => useCompleteCloudSignIn({ followKept: true }), { wrapper: appWrapper });
		await act(() => result.current(GRACE));
		keepSignInRedirect('ada@example.com', mcpAuthorize);
		vi.spyOn(appQueryClient, 'invalidateQueries').mockImplementationOnce(async () => {
			land();
		});

		await expect(act(() => result.current(ADA))).resolves.toBe(false);

		expect(replace).not.toHaveBeenCalled();
		expect(readSignInRedirect('ada@example.com')).toBeUndefined();
	});

	it('leaves the kept target when another sign-in lands during the navigation', async () => {
		keepSignInRedirect('ada@example.com', '/org-1/clu-1/usage');
		navigate.mockImplementationOnce(async () => {
			authStore.setUserForEntity(OverallAppSignIn, GRACE);
		});
		const { result } = renderHook(() => useCompleteCloudSignIn({ followKept: true }), { wrapper: appWrapper });

		await act(() => result.current(ADA));

		expect(readSignInRedirect('ada@example.com')?.redirect).toBe('/org-1/clu-1/usage');
	});

	it('doesn’t put it back when a sign-out lands during the navigation', async () => {
		const { result } = renderHook(() => useCompleteCloudSignIn({ followKept: true }), { wrapper: appWrapper });
		await act(() => result.current(GRACE));
		keepSignInRedirect('ada@example.com', '/org-1/clu-1/usage');
		navigate.mockImplementationOnce(async () => {
			authStore.signOutAllLocally();
		});

		await act(() => result.current(ADA));

		expect(readSignInRedirect('ada@example.com')).toBeUndefined();
	});

	it('leaves a newer target another tab wrote for the address meanwhile', async () => {
		keepSignInRedirect('ada@example.com', mcpAuthorize);
		vi.spyOn(appQueryClient, 'invalidateQueries').mockImplementationOnce(async () => {
			keepSignInRedirect('ada@example.com', '/org-1/clu-1/usage', Date.now() + 1);
		});
		const { result } = renderHook(() => useCompleteCloudSignIn({ followKept: true }), { wrapper: appWrapper });

		await act(() => result.current(ADA));

		expect(replace).toHaveBeenCalledExactlyOnceWith(mcpAuthorize);
		expect(readSignInRedirect('ada@example.com')?.redirect).toBe('/org-1/clu-1/usage');
	});

	it('keeps a followed in-app target when its navigation fails', async () => {
		keepSignInRedirect('ada@example.com', '/org-1/clu-1/usage');
		navigate.mockRejectedValueOnce(new Error('navigation aborted'));
		const { result } = renderHook(() => useCompleteCloudSignIn({ followKept: true }), { wrapper: appWrapper });

		await expect(act(() => result.current(ADA))).rejects.toThrow('navigation aborted');

		expect(readSignInRedirect('ada@example.com')?.redirect).toBe('/org-1/clu-1/usage');
	});

	it('puts back what the previous account’s wipe took when taking the new one in throws', async () => {
		const { result } = renderHook(() => useCompleteCloudSignIn({ followKept: true }), { wrapper: appWrapper });
		await act(() => result.current(GRACE));
		keepSignInRedirect('ada@example.com', mcpAuthorize);
		const kept = readSignInRedirect('ada@example.com');
		// Only for the new account: the previous account's wipe sets the entity too.
		const setUser = authStore.setUserForEntity.bind(authStore);
		vi.spyOn(authStore, 'setUserForEntity').mockImplementation((...args: Parameters<typeof setUser>) => {
			if (args[1] === ADA) {
				throw new Error('replaceState throttled');
			}
			return setUser(...args);
		});

		await expect(act(() => result.current(ADA))).rejects.toThrow('replaceState throttled');

		expect(replace).not.toHaveBeenCalled();
		expect(readSignInRedirect('ada@example.com')).toEqual(kept);
	});

	it('puts back a kept target the previous account’s wipe took, when the page’s own target wins', async () => {
		hashSearch.current = { redirect: '/org-1/clu-1/usage' };
		const { result } = renderHook(() => useCompleteCloudSignIn({ followKept: true }), { wrapper: appWrapper });
		await act(() => result.current(GRACE));
		keepSignInRedirect('ada@example.com', mcpAuthorize);
		const kept = readSignInRedirect('ada@example.com');

		await act(() => result.current(ADA));

		expect(authStore.getConnectionById(OverallAppSignIn).user).toBe(ADA);
		expect(navigate).toHaveBeenLastCalledWith({ href: '/org-1/clu-1/usage' });
		expect(readSignInRedirect('ada@example.com')).toEqual(kept);
	});
});

describe('useCloudSignIn — keeping the target for an emailed link', () => {
	const mcpAuthorize = '/oauth/mcp/authorize?response_type=code&client_id=c&state=s';

	afterEach(() => {
		hashSearch.current = {};
		historyState.current = {};
		localStorage.clear();
	});

	// Back on /sign-in?redirect=… after a reset request, a wrong old password must not cost the reset its target.
	it('keeps a target a reset request kept when a sign-in with the same target fails', async () => {
		keepSignInRedirect(EMAIL, mcpAuthorize);
		hashSearch.current = { redirect: mcpAuthorize };
		post.mockRejectedValue(axiosError(401, { error: 'Invalid credentials' }));
		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });

		act(() => result.current.submitForm({ email: EMAIL, password: 'old-password' }));

		await waitFor(() => expect(result.current.submitError).toBeDefined());
		expect(readSignInRedirect(EMAIL)?.redirect).toBe(mcpAuthorize);
	});

	it('keeps it when the account turns out unverified, which is sent a link', async () => {
		hashSearch.current = { redirect: mcpAuthorize };
		post.mockImplementation((url: string) =>
			url === '/Login/'
				? Promise.reject(axiosError(403, { error: 'User has not verified email address' }))
				: Promise.resolve({ data: { email: EMAIL } })
		);
		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });

		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		await waitFor(() => expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: '/verifying' })));
		expect(readSignInRedirect(EMAIL)?.redirect).toBe(mcpAuthorize);
	});

	it('forgets an earlier flow’s target when an unverified account without one is sent a link', async () => {
		keepSignInRedirect(EMAIL, mcpAuthorize);
		post.mockImplementation((url: string) =>
			url === '/Login/'
				? Promise.reject(axiosError(403, { error: 'User has not verified email address' }))
				: Promise.resolve({ data: { email: EMAIL } })
		);
		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });

		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/verifying', state: { prefillEmail: EMAIL } }));
		await waitFor(() => expect(readSignInRedirect(EMAIL)).toBeUndefined());
	});

	it('leaves an earlier flow’s target when the new link fails to send', async () => {
		keepSignInRedirect(EMAIL, mcpAuthorize);
		post.mockImplementation((url: string) =>
			Promise.reject(
				url === '/Login/'
					? axiosError(403, { error: 'User has not verified email address' })
					: axiosError(429, { error: 'Too many requests' }),
			)
		);
		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });

		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		await waitFor(() => expect(post).toHaveBeenCalledWith('/ResendVerificationEmail/', { email: EMAIL }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(readSignInRedirect(EMAIL)?.redirect).toBe(mcpAuthorize);
	});

	it('leaves a newer target another tab kept while the sign-in was out', async () => {
		keepSignInRedirect(EMAIL, mcpAuthorize);
		let reject!: (reason: unknown) => void;
		post.mockImplementation((url: string) =>
			url === '/Login/'
				? new Promise((_resolve, rejectLogin) => (reject = rejectLogin))
				: Promise.resolve({ data: { email: EMAIL } })
		);
		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });
		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));
		await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

		keepSignInRedirect(EMAIL, '/org-1/clu-1/usage', Date.now() + 1);
		act(() => reject(axiosError(403, { error: 'User has not verified email address' })));

		await waitFor(() => expect(toast.info).toHaveBeenCalled());
		expect(readSignInRedirect(EMAIL)?.redirect).toBe('/org-1/clu-1/usage');
	});

	it('carries the target kept for the address to the link an unverified account is sent after an emailed link', async () => {
		keepSignInRedirect(EMAIL, mcpAuthorize, Date.now() - 1000);
		const before = readSignInRedirect(EMAIL);
		historyState.current = { finishesEmailedLink: true };
		post.mockImplementation((url: string) =>
			url === '/Login/'
				? Promise.reject(axiosError(403, { error: 'User has not verified email address' }))
				: Promise.resolve({ data: { email: EMAIL } })
		);
		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });

		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		await waitFor(() =>
			expect(navigate).toHaveBeenCalledWith({
				to: '/verifying',
				search: { redirect: mcpAuthorize },
				state: { prefillEmail: EMAIL },
			})
		);
		// Kept again, for the new link's full 30 minutes.
		expect(readSignInRedirect(EMAIL)?.expiresAt).toBeGreaterThan(before!.expiresAt);
	});

	it('follows the target a reset kept, for a sign-in that finishes it', async () => {
		const replace = vi.fn();
		vi.stubGlobal('location', { ...window.location, replace });
		keepSignInRedirect(EMAIL, mcpAuthorize);
		historyState.current = { finishesEmailedLink: true };
		post.mockResolvedValue({ data: { id: 'usr-reset', email: EMAIL, roles: {} } });
		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });

		act(() => result.current.submitForm({ email: EMAIL, password: 'new-password' }));

		await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith(mcpAuthorize));
		vi.unstubAllGlobals();
		authStore.signOutAllLocally();
	});

	it('leaves a target another flow kept when a sign-in without one fails', async () => {
		keepSignInRedirect(EMAIL, mcpAuthorize);
		post.mockRejectedValue(axiosError(401, { error: 'Invalid credentials' }));
		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });

		act(() => result.current.submitForm({ email: EMAIL, password: 'wrong' }));

		await waitFor(() => expect(result.current.submitError).toBeDefined());
		expect(readSignInRedirect(EMAIL)?.redirect).toBe(mcpAuthorize);
	});

	it('keeps nothing while the sign-in is out: the login itself sends no email', () => {
		hashSearch.current = { redirect: mcpAuthorize };
		post.mockReturnValue(new Promise(() => {}));
		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });

		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		expect(readSignInRedirect(EMAIL)).toBeUndefined();
	});

	it('leaves a kept target alone when the page has none', () => {
		keepSignInRedirect(EMAIL, mcpAuthorize);
		post.mockReturnValue(new Promise(() => {}));
		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });

		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		expect(readSignInRedirect(EMAIL)?.redirect).toBe(mcpAuthorize);
	});
});
