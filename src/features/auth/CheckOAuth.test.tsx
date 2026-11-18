/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { navigate, routerInvalidate, hashSearch } = vi.hoisted(() => ({
	navigate: vi.fn(),
	routerInvalidate: vi.fn(),
	hashSearch: { current: {} as Record<string, unknown> },
}));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => navigate,
	useRouter: () => ({ invalidate: routerInvalidate }),
	useSearch: () => hashSearch.current,
	Link: ({ children, search }: PropsWithChildren<{ search?: { redirect?: string } }>) => (
		<a data-redirect={search?.redirect}>{children}</a>
	),
}));

vi.mock('sonner', () => ({
	toast: { error: vi.fn() },
}));

const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock('@/features/auth/queries/getCurrentUser', () => ({
	getCurrentUser,
	currentUserQueryKey: ['current-user'],
}));

const { setUserForEntity } = vi.hoisted(() => ({ setUserForEntity: vi.fn() }));
vi.mock('@/features/auth/store/authStore', () => ({
	authStore: { setUserForEntity },
	OverallAppSignIn: 'OverallAppSignIn',
}));

vi.mock('@/integrations/datadog/datadog', () => ({ loginSuccessDatadogAction: vi.fn() }));
vi.mock('@/integrations/reo/reo', () => ({ reoClient: undefined }));
vi.mock('@/lib/urls/getDefaultSignedInCloudRouteForUser', () => ({
	getDefaultSignedInCloudRouteForUser: () => '/default-org',
}));

const { clearUtmParamsFromUrl } = vi.hoisted(() => ({ clearUtmParamsFromUrl: vi.fn() }));
vi.mock('@/lib/urls/clearUtmParams', () => ({ clearUtmParamsFromUrl }));

const { clearOAuthErrorParamsFromUrl } = vi.hoisted(() => ({ clearOAuthErrorParamsFromUrl: vi.fn() }));
vi.mock('@/lib/urls/clearOAuthErrorParams', () => ({ clearOAuthErrorParamsFromUrl }));

const { readOAuthHandoffCodeFromUrl, clearOAuthHandoffCodeFromUrl, redeemOAuthHandoff } = vi.hoisted(() => ({
	readOAuthHandoffCodeFromUrl: vi.fn(),
	clearOAuthHandoffCodeFromUrl: vi.fn(),
	redeemOAuthHandoff: vi.fn(),
}));
vi.mock('@/lib/urls/oauthHandoff', () => ({ readOAuthHandoffCodeFromUrl, clearOAuthHandoffCodeFromUrl }));
vi.mock('./redeemOAuthHandoff', () => ({ redeemOAuthHandoff }));

import { toast } from 'sonner';
import { CheckOAuth } from './CheckOAuth';
import { OAUTH_GENERIC_ERROR_MESSAGE } from './getOAuthErrorMessage';

function renderCheckOAuth() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const wrapper = ({ children }: PropsWithChildren) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	return render(<CheckOAuth />, { wrapper });
}

const replace = vi.fn();

function stubLocationSearch(search: string) {
	vi.stubGlobal('location', { ...window.location, search, replace });
}

beforeEach(() => {
	hashSearch.current = {};
	replace.mockReset();
	getCurrentUser.mockReset();
	navigate.mockClear();
	routerInvalidate.mockClear();
	setUserForEntity.mockClear();
	clearUtmParamsFromUrl.mockClear();
	clearOAuthErrorParamsFromUrl.mockClear();
	readOAuthHandoffCodeFromUrl.mockReset().mockReturnValue(null);
	clearOAuthHandoffCodeFromUrl.mockReset();
	redeemOAuthHandoff.mockReset().mockResolvedValue(undefined);
	(toast.error as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('CheckOAuth', () => {
	it('shows the reason-specific message and skips getCurrentUser when the redirect carries error/reason', async () => {
		stubLocationSearch('?error=access_denied&reason=email_not_verified');
		renderCheckOAuth();

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));

		expect(toast.error).toHaveBeenCalledWith(
			'Verify your email address before signing in with this provider.',
			{ duration: 10_000 },
		);
		expect(getCurrentUser).not.toHaveBeenCalled();
		expect(clearOAuthErrorParamsFromUrl).toHaveBeenCalled();
	});

	it('falls back to the generic message for an unrecognized error/reason pair', async () => {
		stubLocationSearch('?error=something_new&reason=also_new');
		renderCheckOAuth();

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));
		expect(toast.error).toHaveBeenCalledWith(OAUTH_GENERIC_ERROR_MESSAGE, { duration: 10_000 });
		expect(getCurrentUser).not.toHaveBeenCalled();
	});

	it('still calls getCurrentUser and uses the original generic toast when there is no error param', async () => {
		stubLocationSearch('');
		getCurrentUser.mockRejectedValue(new Error('not signed in'));
		renderCheckOAuth();

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));
		expect(getCurrentUser).toHaveBeenCalledTimes(1);
		expect(toast.error).toHaveBeenCalledWith(OAUTH_GENERIC_ERROR_MESSAGE, { duration: 10_000 });
	});

	it('signs the user in normally when there is no error param and getCurrentUser succeeds', async () => {
		stubLocationSearch('');
		getCurrentUser.mockResolvedValue({ id: 'u1', email: 'user@example.com' });
		renderCheckOAuth();

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/default-org' }));
		expect(toast.error).not.toHaveBeenCalled();
		expect(setUserForEntity).toHaveBeenCalledWith('OverallAppSignIn', { id: 'u1', email: 'user@example.com' });
		expect(clearUtmParamsFromUrl).toHaveBeenCalled();
	});

	// `checking` is a module-level lock; it must release even when navigate/router.invalidate/
	// queryClient.invalidateQueries rejects, or every later mount is a permanent no-op.
	it('releases the lock when an awaited call rejects, so a later mount runs the check again', async () => {
		stubLocationSearch('');
		getCurrentUser.mockResolvedValue(null);
		const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		navigate.mockRejectedValueOnce(new Error('navigation aborted'));

		const { unmount } = renderCheckOAuth();
		await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
		await waitFor(() =>
			expect(consoleDebug).toHaveBeenCalledWith('OAuth sign-in check failed, carrying on:', expect.any(Error))
		);
		unmount();

		getCurrentUser.mockClear();
		navigate.mockClear();
		navigate.mockResolvedValue(undefined);
		renderCheckOAuth();

		await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));
		consoleDebug.mockRestore();
	});

	// clearOAuthErrorParamsFromUrl's history.replaceState can throw synchronously (some browsers
	// throttle it); the rest of the check (here, the no-error-param path) must still run on the
	// same mount, logged separately from the check's own outer failure handler.
	it('keeps checking on the same mount when clearOAuthErrorParamsFromUrl throws synchronously', async () => {
		stubLocationSearch('');
		getCurrentUser.mockResolvedValue(null);
		const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		clearOAuthErrorParamsFromUrl.mockImplementationOnce(() => {
			throw new Error('history.replaceState throttled');
		});

		renderCheckOAuth();

		await waitFor(() =>
			expect(consoleDebug).toHaveBeenCalledWith(
				'Failed to clear OAuth error params from the URL, carrying on:',
				expect.objectContaining({ message: 'history.replaceState throttled' }),
			)
		);
		await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));
		consoleDebug.mockRestore();
	});

	// Cursor Grok (pre-push review): the same throw, but with an error param present, must not
	// skip the one thing this component exists to do — show the mapped message and redirect.
	it('still shows the mapped message when clearOAuthErrorParamsFromUrl throws on a failed redirect', async () => {
		stubLocationSearch('?error=access_denied&reason=email_not_verified');
		const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		clearOAuthErrorParamsFromUrl.mockImplementationOnce(() => {
			throw new Error('history.replaceState throttled');
		});

		renderCheckOAuth();

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));
		expect(toast.error).toHaveBeenCalledWith(
			'Verify your email address before signing in with this provider.',
			{ duration: 10_000 },
		);
		expect(getCurrentUser).not.toHaveBeenCalled();
		consoleDebug.mockRestore();
	});
});

describe('CheckOAuth redirect', () => {
	const mcpAuthorize = '/oauth/mcp/authorize?response_type=code&client_id=c&state=s';

	it('replaces this page with the MCP authorization once the session is confirmed', async () => {
		stubLocationSearch('');
		hashSearch.current = { redirect: mcpAuthorize };
		getCurrentUser.mockResolvedValue({ id: 'u1', email: 'user@example.com' });
		renderCheckOAuth();

		await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith(mcpAuthorize));
		expect(setUserForEntity).toHaveBeenCalledWith('OverallAppSignIn', { id: 'u1', email: 'user@example.com' });
		expect(navigate).not.toHaveBeenCalled();
	});

	it('still follows it when the sign-in bookkeeping throws', async () => {
		stubLocationSearch('');
		hashSearch.current = { redirect: mcpAuthorize };
		getCurrentUser.mockResolvedValue({ id: 'u1', email: 'user@example.com' });
		const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		clearUtmParamsFromUrl.mockImplementationOnce(() => {
			throw new Error('history.replaceState throttled');
		});
		renderCheckOAuth();

		await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith(mcpAuthorize));
		expect(consoleDebug).toHaveBeenCalledWith('Sign-in bookkeeping failed, carrying on:', expect.any(Error));
		consoleDebug.mockRestore();
	});

	it('navigates to an in-app redirect', async () => {
		stubLocationSearch('');
		hashSearch.current = { redirect: '/org-1/clu-1/usage' };
		getCurrentUser.mockResolvedValue({ id: 'u1', email: 'user@example.com' });
		renderCheckOAuth();

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/org-1/clu-1/usage' }));
		expect(replace).not.toHaveBeenCalled();
	});

	it.each([
		['another host', 'https://evil.example/oauth/mcp/authorize'],
		['a protocol-relative host', '//evil.example/oauth/mcp/authorize'],
		['another server path', '/oauth/google/login'],
	])('never leaves the app for %s', async (_label, redirect) => {
		stubLocationSearch('');
		hashSearch.current = { redirect };
		getCurrentUser.mockResolvedValue({ id: 'u1', email: 'user@example.com' });
		renderCheckOAuth();

		await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
		expect(replace).not.toHaveBeenCalled();
		expect(navigate.mock.calls[0][0].to).toMatch(/^\/(?!\/)/);
	});

	it('keeps the redirect on the way back to the sign-in page after a failed sign-in', async () => {
		stubLocationSearch('?error=access_denied&reason=email_not_verified');
		hashSearch.current = { redirect: mcpAuthorize };
		renderCheckOAuth();

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in', search: { redirect: mcpAuthorize } }));
		expect(replace).not.toHaveBeenCalled();
		expect(screen.getByText('Try signing in again').closest('a')?.dataset.redirect).toBe(mcpAuthorize);
	});

	it('keeps it when no session came back either', async () => {
		stubLocationSearch('');
		hashSearch.current = { redirect: mcpAuthorize };
		getCurrentUser.mockResolvedValue(null);
		renderCheckOAuth();

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in', search: { redirect: mcpAuthorize } }));
		expect(replace).not.toHaveBeenCalled();
	});
});

describe('CheckOAuth sign-in handoff', () => {
	it('clears the code from the URL, redeems it, then signs in with the session it made', async () => {
		stubLocationSearch('');
		readOAuthHandoffCodeFromUrl.mockReturnValue('code-1');
		const order: string[] = [];
		clearOAuthHandoffCodeFromUrl.mockImplementation(() => order.push('clear'));
		redeemOAuthHandoff.mockImplementation(async () => {
			order.push('redeem');
		});
		getCurrentUser.mockImplementation(async () => {
			order.push('getCurrentUser');
			return { id: 'u1', email: 'user@example.com' };
		});

		renderCheckOAuth();

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/default-org' }));
		expect(redeemOAuthHandoff).toHaveBeenCalledExactlyOnceWith('code-1');
		expect(order).toEqual(['clear', 'redeem', 'getCurrentUser']);
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('still checks for a session when the redeem is refused', async () => {
		stubLocationSearch('');
		const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		readOAuthHandoffCodeFromUrl.mockReturnValue('code-1');
		redeemOAuthHandoff.mockRejectedValue(new Error('refused (400)'));
		getCurrentUser.mockResolvedValue(null);

		renderCheckOAuth();

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));
		expect(getCurrentUser).toHaveBeenCalledTimes(1);
		expect(toast.error).toHaveBeenCalledWith(OAUTH_GENERIC_ERROR_MESSAGE, { duration: 10_000 });
		expect(consoleDebug).toHaveBeenCalledWith(
			'OAuth sign-in handoff failed, checking for a session anyway:',
			expect.objectContaining({ message: 'refused (400)' }),
		);
		consoleDebug.mockRestore();
	});

	it('still redeems when clearing the code from the URL throws', async () => {
		stubLocationSearch('');
		const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		readOAuthHandoffCodeFromUrl.mockReturnValue('code-1');
		clearOAuthHandoffCodeFromUrl.mockImplementation(() => {
			throw new Error('history.replaceState throttled');
		});
		getCurrentUser.mockResolvedValue({ id: 'u1', email: 'user@example.com' });

		renderCheckOAuth();

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/default-org' }));
		expect(redeemOAuthHandoff).toHaveBeenCalledExactlyOnceWith('code-1');
		consoleDebug.mockRestore();
	});

	it('redeems nothing without a code, or when the redirect carries an error', async () => {
		stubLocationSearch('');
		getCurrentUser.mockResolvedValue({ id: 'u1', email: 'user@example.com' });
		const { unmount } = renderCheckOAuth();
		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/default-org' }));
		unmount();

		stubLocationSearch('?error=auth_failed&reason=token_exchange');
		readOAuthHandoffCodeFromUrl.mockReturnValue('code-1');
		renderCheckOAuth();
		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));

		expect(redeemOAuthHandoff).not.toHaveBeenCalled();
	});
});
