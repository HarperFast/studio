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
const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post, get } }));

// The hook only reaches for the router; give it inert doubles we can assert against.
// One router object for the whole file, matching production's stable one.
const { navigate, router, hashSearch, historyState } = vi.hoisted(() => ({
	navigate: vi.fn(),
	router: { invalidate: vi.fn() },
	hashSearch: { current: {} as Record<string, unknown> },
	historyState: { current: {} as { emailedFlow?: string } },
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

describe('useCloudSignIn — while the completion decides where to land', () => {
	afterEach(() => {
		hashSearch.current = {};
		authStore.signOutAllLocally();
		appQueryClient.clear();
		get.mockReset();
		post.mockReset();
	});

	it('frees the form when the completion fails, without an unhandled rejection', async () => {
		const member = {
			id: 'usr-new',
			email: EMAIL,
			roles: {},
			fabricRole: 'least_privileged',
			staffPermissions: [],
		} as unknown as User;
		post.mockResolvedValue({ data: member });
		navigate.mockRejectedValueOnce(new Error('navigation aborted'));
		const { result } = renderHook(() => useCloudSignIn(), {
			wrapper: ({ children }: PropsWithChildren) => (
				<QueryClientProvider client={appQueryClient}>{children}</QueryClientProvider>
			),
		});

		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		await waitFor(() => expect(navigate).toHaveBeenCalled());
		await waitFor(() => expect(result.current.isPending).toBe(false));
	});

	it('stays busy, and takes no second sign-in, until the target is settled', async () => {
		hashSearch.current = { redirect: '/org-1/users' };
		const fromLogin = { id: 'usr-new', email: EMAIL, roles: {} } as unknown as User;
		post.mockResolvedValue({ data: fromLogin });
		let answer: (value: unknown) => void = () => undefined;
		get.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
		const { result } = renderHook(() => useCloudSignIn(), {
			wrapper: ({ children }: PropsWithChildren) => (
				<QueryClientProvider client={appQueryClient}>{children}</QueryClientProvider>
			),
		});

		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));
		await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
		expect(result.current.isPending).toBe(true);
		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));
		expect(post).toHaveBeenCalledTimes(1);

		await act(async () => answer({ data: { ...fromLogin, fabricRole: 'least_privileged', staffPermissions: [] } }));
		await waitFor(() => expect(result.current.isPending).toBe(false));
		expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/' });
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
	const ADA = { id: 'usr-ada', email: 'ada@example.com', roles: { 'org-1': {} } } as unknown as User;
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

describe('useCompleteCloudSignIn — a target into an organization the account can’t open', () => {
	// As /Login/ answers: roles, no staff fields.
	const NEWCOMER = { id: 'usr-new', email: 'new@example.com', roles: {} } as unknown as User;
	// As /User/current answers, so nothing about it is left to ask.
	const MEMBER = {
		id: 'usr-member',
		email: 'member@example.com',
		roles: { 'org-1': {} },
		fabricRole: 'least_privileged',
		staffPermissions: [],
	} as unknown as User;
	const customerRecord = (user: User, roles: Record<string, unknown> = {}) => ({
		...user,
		roles,
		fabricRole: 'least_privileged',
		staffPermissions: [],
	});
	const previousAccountsPage = '/org-1/users';

	function appWrapper({ children }: PropsWithChildren) {
		return <QueryClientProvider client={appQueryClient}>{children}</QueryClientProvider>;
	}

	beforeEach(() => {
		authStore.signOutAllLocally();
		appQueryClient.clear();
		localStorage.clear();
	});
	afterEach(() => {
		hashSearch.current = {};
		authStore.signOutAllLocally();
		appQueryClient.clear();
		localStorage.clear();
		get.mockReset();
	});

	it('goes to the account’s own default route instead, once /User/current says it isn’t staff', async () => {
		hashSearch.current = { redirect: previousAccountsPage };
		get.mockResolvedValue({ data: { ...NEWCOMER, fabricRole: 'least_privileged', staffPermissions: [] } });
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await expect(act(() => result.current(NEWCOMER))).resolves.toBe(true);

		expect(get).toHaveBeenCalledExactlyOnceWith('/User/current', { timeout: 5_000 });
		expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/' });
	});

	it('follows it for staff who can read any organization', async () => {
		hashSearch.current = { redirect: previousAccountsPage };
		get.mockResolvedValue({ data: { ...NEWCOMER, fabricRole: 'fabric_support', staffPermissions: ['org:read'] } });
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await act(() => result.current(NEWCOMER));

		expect(navigate).toHaveBeenCalledExactlyOnceWith({ href: previousAccountsPage });
	});

	it('follows a member’s target without asking when the record is /User/current’s', async () => {
		hashSearch.current = { redirect: previousAccountsPage };
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await act(() => result.current(MEMBER));

		expect(get).not.toHaveBeenCalled();
		expect(navigate).toHaveBeenCalledExactlyOnceWith({ href: previousAccountsPage });
	});

	it('asks about a /Login/ membership, which can’t show an organization’s single sign-on lock', async () => {
		const fromLogin = { id: 'usr-member', email: 'member@example.com', roles: { 'org-1': {} } } as unknown as User;
		hashSearch.current = { redirect: previousAccountsPage };
		get.mockResolvedValue({
			data: customerRecord(fromLogin, { 'org-1': { oauthProviders: [{ name: 'Okta', oauthConfigId: 'oac-1' }] } }),
		});
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await act(() => result.current(fromLogin));

		expect(get).toHaveBeenCalledTimes(1);
		expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/' });
	});

	it('ends without taking the account in when /User/current says the session is gone', async () => {
		hashSearch.current = { redirect: previousAccountsPage };
		get.mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await expect(act(() => result.current(NEWCOMER))).resolves.toBe(false);

		expect(authStore.getConnectionById(OverallAppSignIn).user).toBeNull();
		expect(navigate).not.toHaveBeenCalled();
		expect(get).toHaveBeenCalledTimes(1);
	});

	it('decides a kept target from the fresh record once it has one', async () => {
		// /Login/ still lists org-1, which /User/current no longer does.
		const fromLogin = { id: 'usr-new', email: 'new@example.com', roles: { 'org-1': {} } } as unknown as User;
		const flow = keepSignInRedirect('/org-1/clu-1/usage');
		hashSearch.current = { redirect: '/org-9/users' };
		get.mockResolvedValue({ data: customerRecord(fromLogin) });
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow }), { wrapper: appWrapper });

		await act(() => result.current(fromLogin));

		expect(get).toHaveBeenCalledTimes(1);
		expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/' });
	});

	it('isn’t replaced by a newer completion that gives up before settling', async () => {
		hashSearch.current = { redirect: previousAccountsPage };
		let answer: (value: unknown) => void = () => undefined;
		get.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		let first: Promise<boolean> | undefined;
		act(() => {
			first = result.current(NEWCOMER);
		});
		await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
		await expect(act(() => result.current(MEMBER, { stillCurrent: () => false }))).resolves.toBe(false);
		await act(async () => answer({ data: customerRecord(NEWCOMER) }));

		await expect(first).resolves.toBe(true);
		expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/' });
	});

	it('leaves the session to a newer completion in this tab that is still settling', async () => {
		hashSearch.current = { redirect: previousAccountsPage };
		const newer = { id: 'usr-newer', email: 'newer@example.com', roles: {} } as unknown as User;
		let answerFirst: (value: unknown) => void = () => undefined;
		let answerNewer: (value: unknown) => void = () => undefined;
		get
			.mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)))
			.mockReturnValueOnce(new Promise((resolve) => (answerNewer = resolve)))
			.mockResolvedValue({ data: customerRecord(newer) });
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		let first: Promise<boolean> | undefined;
		let second: Promise<boolean> | undefined;
		act(() => {
			first = result.current(NEWCOMER);
		});
		await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
		act(() => {
			second = result.current(newer);
		});
		await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
		// The session is the newer sign-in's: the older completion's answer is for that account.
		await act(async () => answerFirst({ data: customerRecord(newer) }));
		await expect(first).resolves.toBe(false);
		await act(async () => answerNewer({ data: customerRecord(newer) }));

		await expect(second).resolves.toBe(true);
		expect(get).toHaveBeenCalledTimes(2);
		expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/' });
	});

	it('leaves the session to a newer completion in this tab when its own answer was for another account', async () => {
		hashSearch.current = { redirect: previousAccountsPage };
		let answer: (value: unknown) => void = () => undefined;
		get.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		let first: Promise<boolean> | undefined;
		act(() => {
			first = result.current(NEWCOMER);
		});
		await act(() => result.current(MEMBER));
		await act(async () => answer({ data: customerRecord({ ...NEWCOMER, id: 'usr-other' } as User) }));

		await expect(first).resolves.toBe(false);
		expect(get).toHaveBeenCalledTimes(1);
		expect(authStore.getConnectionById(OverallAppSignIn).user).toBe(MEMBER);
	});

	it('decides from a full account record without asking, as the OAuth and emailed flows hand it one', async () => {
		hashSearch.current = { redirect: previousAccountsPage };
		const full = { ...NEWCOMER, fabricRole: 'least_privileged', staffPermissions: [] } as unknown as User;
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await act(() => result.current(full));

		expect(get).not.toHaveBeenCalled();
		expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/' });
	});

	it('follows it as before when /User/current can’t be read', async () => {
		hashSearch.current = { redirect: previousAccountsPage };
		get.mockRejectedValue(new Error('offline'));
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await act(() => result.current(NEWCOMER));

		expect(navigate).toHaveBeenCalledExactlyOnceWith({ href: previousAccountsPage });
	});

	it('passes over a closed page target to the emailed flow’s, asking /User/current once', async () => {
		const flow = keepSignInRedirect('/profile');
		hashSearch.current = { redirect: previousAccountsPage };
		get.mockResolvedValue({ data: { ...NEWCOMER, fabricRole: 'least_privileged', staffPermissions: [] } });
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow }), { wrapper: appWrapper });

		await act(() => result.current(NEWCOMER));

		expect(get).toHaveBeenCalledTimes(1);
		expect(navigate).toHaveBeenCalledExactlyOnceWith({ href: '/profile' });
	});

	it('settles the target before taking the account in, then takes in the record it read', async () => {
		hashSearch.current = { redirect: previousAccountsPage };
		const full = { ...NEWCOMER, fabricRole: 'least_privileged', staffPermissions: [] };
		let takenInWhileAsking: unknown = 'not asked';
		get.mockImplementation(async () => {
			// Taking it in re-runs the page's guard, which would follow the redirect for a /Login/ record.
			takenInWhileAsking = authStore.getConnectionById(OverallAppSignIn).user;
			return { data: full };
		});
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await act(() => result.current(NEWCOMER));

		expect(takenInWhileAsking).toBeNull();
		expect(authStore.getConnectionById(OverallAppSignIn).user).toEqual(full);
		expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/' });
	});

	it('ends the completion when /User/current answers for another account', async () => {
		hashSearch.current = { redirect: previousAccountsPage };
		get.mockResolvedValue({
			data: { id: 'usr-someone-else', roles: {}, fabricRole: 'least_privileged', staffPermissions: [] },
		});
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		// The session belongs to someone else now: taking this account in would put its name over theirs.
		await expect(act(() => result.current(NEWCOMER))).resolves.toBe(false);

		expect(navigate).not.toHaveBeenCalled();
		await waitFor(() =>
			expect((authStore.getConnectionById(OverallAppSignIn).user as User | null)?.id).toBe('usr-someone-else')
		);
	});

	it('asks nothing for a completion whose page has already moved on', async () => {
		hashSearch.current = { redirect: previousAccountsPage };
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await expect(act(() => result.current(NEWCOMER, { stillCurrent: () => false }))).resolves.toBe(false);

		expect(get).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	it('asks /User/current once for two targets it can’t open, then goes to the default route', async () => {
		const flow = keepSignInRedirect('/org-2/clu-1/usage');
		hashSearch.current = { redirect: previousAccountsPage };
		get.mockResolvedValue({ data: { ...NEWCOMER, fabricRole: 'least_privileged', staffPermissions: [] } });
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow }), { wrapper: appWrapper });

		await act(() => result.current(NEWCOMER));

		expect(get).toHaveBeenCalledTimes(1);
		expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/' });
	});

	it('gives up without navigating when another sign-in lands while it asks', async () => {
		hashSearch.current = { redirect: previousAccountsPage };
		get.mockImplementation(async () => {
			authStore.setUserForEntity(OverallAppSignIn, MEMBER);
			return { data: { ...NEWCOMER, fabricRole: 'least_privileged', staffPermissions: [] } };
		});
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await expect(act(() => result.current(NEWCOMER))).resolves.toBe(false);

		expect(navigate).not.toHaveBeenCalled();
	});
});

describe('useCompleteCloudSignIn — a target kept across an emailed link', () => {
	const ADA = { id: 'usr-ada', email: 'ada@example.com', roles: { 'org-1': {} } } as unknown as User;
	const GRACE = { id: 'usr-grace', email: 'grace@example.com', roles: { 'org-1': {} } } as unknown as User;
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

	it('continues to the flow’s target when the page has none, and forgets it', async () => {
		const flow = keepSignInRedirect(mcpAuthorize);
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow }), { wrapper: appWrapper });

		await expect(act(() => result.current(ADA))).resolves.toBe(true);

		expect(replace).toHaveBeenCalledExactlyOnceWith(mcpAuthorize);
		expect(readSignInRedirect(flow)).toBeUndefined();
	});

	it('leaves it alone for a completion that finishes no emailed flow', async () => {
		const flow = keepSignInRedirect(mcpAuthorize);
		const { result } = renderHook(() => useCompleteCloudSignIn(), { wrapper: appWrapper });

		await act(() => result.current(ADA));

		expect(replace).not.toHaveBeenCalled();
		expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: expect.any(String) });
		expect(readSignInRedirect(flow)?.redirect).toBe(mcpAuthorize);
	});

	it('leaves another flow’s target alone', async () => {
		const own = keepSignInRedirect('/org-1/clu-1/usage');
		const other = keepSignInRedirect(mcpAuthorize);
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow: own }), { wrapper: appWrapper });

		await act(() => result.current(ADA));

		expect(replace).not.toHaveBeenCalled();
		expect(navigate).toHaveBeenCalledExactlyOnceWith({ href: '/org-1/clu-1/usage' });
		expect(readSignInRedirect(other)?.redirect).toBe(mcpAuthorize);
	});

	it('prefers the page’s own target, and the flow is done either way', async () => {
		const flow = keepSignInRedirect(mcpAuthorize);
		hashSearch.current = { redirect: '/org-1/clu-1/usage' };
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow }), { wrapper: appWrapper });

		await act(() => result.current(ADA));

		expect(navigate).toHaveBeenCalledExactlyOnceWith({ href: '/org-1/clu-1/usage' });
		expect(replace).not.toHaveBeenCalled();
		expect(readSignInRedirect(flow)).toBeUndefined();
	});

	it('keeps it when the completion gives up', async () => {
		const flow = keepSignInRedirect(mcpAuthorize);
		vi.spyOn(appQueryClient, 'invalidateQueries').mockImplementationOnce(async () => {
			authStore.setUserForEntity(OverallAppSignIn, GRACE);
		});
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow }), { wrapper: appWrapper });

		await expect(act(() => result.current(ADA))).resolves.toBe(false);

		expect(replace).not.toHaveBeenCalled();
		expect(readSignInRedirect(flow)?.redirect).toBe(mcpAuthorize);
	});

	// Clearing the previous account wipes localStorage, so the kept target has to be read before it.
	it('still continues to it when the browser held another account', async () => {
		const flow = keepSignInRedirect(mcpAuthorize);
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow }), { wrapper: appWrapper });
		authStore.setUserForEntity(OverallAppSignIn, GRACE);

		await expect(act(() => result.current(ADA))).resolves.toBe(true);

		expect(authStore.getConnectionById(OverallAppSignIn).user).toBe(ADA);
		expect(replace).toHaveBeenCalledExactlyOnceWith(mcpAuthorize);
		expect(readSignInRedirect(flow)).toBeUndefined();
	});

	// A sign-out's own wipe takes the kept target too; giving up must not write it back after that wipe.
	it.each([
		['a sign-out', () => authStore.signOutAllLocally()],
		[
			'another sign-in',
			() => authStore.setUserForEntity(OverallAppSignIn, { ...GRACE, id: 'usr-other' } as unknown as User),
		],
	])('doesn’t put back what the previous account’s wipe took when %s lands meanwhile', async (_label, land) => {
		const flow = keepSignInRedirect(mcpAuthorize);
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow }), { wrapper: appWrapper });
		authStore.setUserForEntity(OverallAppSignIn, GRACE);
		vi.spyOn(appQueryClient, 'invalidateQueries').mockImplementationOnce(async () => {
			land();
		});

		await expect(act(() => result.current(ADA))).resolves.toBe(false);

		expect(replace).not.toHaveBeenCalled();
		expect(readSignInRedirect(flow)).toBeUndefined();
	});

	it('leaves the kept target when another sign-in lands during the navigation', async () => {
		const flow = keepSignInRedirect('/org-1/clu-1/usage');
		navigate.mockImplementationOnce(async () => {
			authStore.setUserForEntity(OverallAppSignIn, GRACE);
		});
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow }), { wrapper: appWrapper });

		await act(() => result.current(ADA));

		expect(readSignInRedirect(flow)?.redirect).toBe('/org-1/clu-1/usage');
	});

	it('doesn’t put it back when a sign-out lands during the navigation', async () => {
		const flow = keepSignInRedirect('/org-1/clu-1/usage');
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow }), { wrapper: appWrapper });
		authStore.setUserForEntity(OverallAppSignIn, GRACE);
		navigate.mockImplementationOnce(async () => {
			authStore.signOutAllLocally();
		});

		await act(() => result.current(ADA));

		expect(readSignInRedirect(flow)).toBeUndefined();
	});

	it('gives up without taking the user in or navigating once its page has moved on', async () => {
		const flow = keepSignInRedirect(mcpAuthorize);
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow }), { wrapper: appWrapper });

		await expect(act(() => result.current(ADA, { stillCurrent: () => false }))).resolves.toBe(false);

		expect(authStore.getConnectionById(OverallAppSignIn).user).toBeNull();
		expect(navigate).not.toHaveBeenCalled();
		expect(replace).not.toHaveBeenCalled();
		expect(readSignInRedirect(flow)?.redirect).toBe(mcpAuthorize);
	});

	it('gives up before navigating when its page moves on while the user is taken in', async () => {
		const flow = keepSignInRedirect(mcpAuthorize);
		let current = true;
		vi.spyOn(appQueryClient, 'invalidateQueries').mockImplementationOnce(async () => {
			current = false;
		});
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow }), { wrapper: appWrapper });

		await expect(act(() => result.current(ADA, { stillCurrent: () => current }))).resolves.toBe(false);

		expect(navigate).not.toHaveBeenCalled();
		expect(replace).not.toHaveBeenCalled();
		expect(readSignInRedirect(flow)?.redirect).toBe(mcpAuthorize);
	});

	it('doesn’t put back what the previous account’s wipe took when another account takes the session', async () => {
		const flow = keepSignInRedirect('/org-2/clu-1/usage');
		get.mockResolvedValue({
			data: { ...GRACE, id: 'usr-other', fabricRole: 'least_privileged', staffPermissions: [] },
		});
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow }), { wrapper: appWrapper });
		authStore.setUserForEntity(OverallAppSignIn, GRACE);

		await expect(act(() => result.current(ADA))).resolves.toBe(false);

		expect(readSignInRedirect(flow)).toBeUndefined();
		get.mockReset();
	});

	it('puts back what the previous account’s wipe took when its page has moved on', async () => {
		const flow = keepSignInRedirect(mcpAuthorize);
		const kept = readSignInRedirect(flow);
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow }), { wrapper: appWrapper });
		authStore.setUserForEntity(OverallAppSignIn, GRACE);

		await expect(act(() => result.current(ADA, { stillCurrent: () => false }))).resolves.toBe(false);

		expect(authStore.getConnectionById(OverallAppSignIn).user).not.toBe(ADA);
		expect(readSignInRedirect(flow)).toEqual(kept);
	});

	it('keeps a followed in-app target when its navigation fails', async () => {
		const flow = keepSignInRedirect('/org-1/clu-1/usage');
		navigate.mockRejectedValueOnce(new Error('navigation aborted'));
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow }), { wrapper: appWrapper });

		await expect(act(() => result.current(ADA))).rejects.toThrow('navigation aborted');

		expect(readSignInRedirect(flow)?.redirect).toBe('/org-1/clu-1/usage');
	});

	it.each([
		['before the store takes it in', false],
		['after the store has moved its sign-in revision', true],
	])('puts back what the previous account’s wipe took when taking the new one in throws %s', async (_when, after) => {
		const flow = keepSignInRedirect(mcpAuthorize);
		const kept = readSignInRedirect(flow);
		const { result } = renderHook(() => useCompleteCloudSignIn({ flow }), { wrapper: appWrapper });
		authStore.setUserForEntity(OverallAppSignIn, GRACE);
		// Only for the new account: the previous account's wipe sets the entity too.
		const setUser = authStore.setUserForEntity.bind(authStore);
		vi.spyOn(authStore, 'setUserForEntity').mockImplementation((...args: Parameters<typeof setUser>) => {
			if (args[1] !== ADA) {
				return setUser(...args);
			}
			if (after) {
				setUser(...args);
			}
			throw new Error('replaceState throttled');
		});

		await expect(act(() => result.current(ADA))).rejects.toThrow('replaceState throttled');

		expect(replace).not.toHaveBeenCalled();
		expect(readSignInRedirect(flow)).toEqual(kept);
	});
});

describe('useCloudSignIn — keeping the target for an emailed link', () => {
	const mcpAuthorize = '/oauth/mcp/authorize?response_type=code&client_id=c&state=s';
	const unverified = (url: string) =>
		url === '/Login/'
			? Promise.reject(axiosError(403, { error: 'User has not verified email address' }))
			: Promise.resolve({ data: { email: EMAIL } });

	function resendBody(): { email: string; flow?: string } | undefined {
		return post.mock.calls.find(([url]) => url === '/ResendVerificationEmail/')?.[1];
	}

	afterEach(() => {
		hashSearch.current = {};
		historyState.current = {};
		localStorage.clear();
	});

	it('leaves a flow’s target alone when a sign-in fails', async () => {
		const flow = keepSignInRedirect(mcpAuthorize);
		historyState.current = { emailedFlow: flow };
		post.mockRejectedValue(axiosError(401, { error: 'Invalid credentials' }));
		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });

		act(() => result.current.submitForm({ email: EMAIL, password: 'old-password' }));

		await waitFor(() => expect(result.current.submitError).toBeDefined());
		expect(readSignInRedirect(flow)?.redirect).toBe(mcpAuthorize);
	});

	it('keeps the page’s target under a new flow the link an unverified account is sent names', async () => {
		hashSearch.current = { redirect: mcpAuthorize };
		post.mockImplementation(unverified);
		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });

		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		await waitFor(() => expect(resendBody()).toBeDefined());
		const { flow } = resendBody()!;
		expect(flow).toMatch(/^[A-Za-z0-9_-]{22}$/);
		expect(readSignInRedirect(flow)?.redirect).toBe(mcpAuthorize);
	});

	it('names no flow in the link an unverified account without a target is sent', async () => {
		const earlier = keepSignInRedirect(mcpAuthorize);
		post.mockImplementation(unverified);
		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });

		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		await waitFor(() => expect(resendBody()).toEqual({ email: EMAIL }));
		expect(navigate).toHaveBeenCalledWith({ to: '/verifying', state: { prefillEmail: EMAIL } });
		expect(readSignInRedirect(earlier)?.redirect).toBe(mcpAuthorize);
	});

	it('carries the target of the emailed flow it finishes to the new link an unverified account is sent', async () => {
		const finished = keepSignInRedirect(mcpAuthorize);
		historyState.current = { emailedFlow: finished };
		post.mockImplementation(unverified);
		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });

		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		await waitFor(() =>
			expect(navigate).toHaveBeenCalledWith({
				to: '/verifying',
				search: { redirect: mcpAuthorize },
				state: { prefillEmail: EMAIL },
			})
		);
		const { flow } = resendBody()!;
		expect(flow).not.toBe(finished);
		expect(readSignInRedirect(flow)?.redirect).toBe(mcpAuthorize);
	});

	it('follows the target a reset kept, for a sign-in that finishes its flow', async () => {
		const replace = vi.fn();
		vi.stubGlobal('location', { ...window.location, replace });
		historyState.current = { emailedFlow: keepSignInRedirect(mcpAuthorize) };
		post.mockResolvedValue({ data: { id: 'usr-reset', email: EMAIL, roles: {} } });
		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });

		act(() => result.current.submitForm({ email: EMAIL, password: 'new-password' }));

		await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith(mcpAuthorize));
		vi.unstubAllGlobals();
		authStore.signOutAllLocally();
	});

	it('keeps nothing while the sign-in is out: the login itself sends no email', () => {
		hashSearch.current = { redirect: mcpAuthorize };
		post.mockReturnValue(new Promise(() => {}));
		const { result } = renderHook(() => useCloudSignIn(), { wrapper: wrapper() });

		act(() => result.current.submitForm({ email: EMAIL, password: 'correct-horse' }));

		expect(localStorage.length).toBe(0);
	});
});
