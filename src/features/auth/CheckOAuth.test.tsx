/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { navigate, routerInvalidate } = vi.hoisted(() => ({
	navigate: vi.fn(),
	routerInvalidate: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => navigate,
	useRouter: () => ({ invalidate: routerInvalidate }),
	useSearch: () => ({}),
	Link: ({ children }: PropsWithChildren) => <a>{children}</a>,
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

function stubLocationSearch(search: string) {
	vi.stubGlobal('location', { ...window.location, search });
}

beforeEach(() => {
	getCurrentUser.mockReset();
	navigate.mockClear();
	routerInvalidate.mockClear();
	setUserForEntity.mockClear();
	clearUtmParamsFromUrl.mockClear();
	clearOAuthErrorParamsFromUrl.mockClear();
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

	// The module-level `checking` lock must release even when an awaited call rejects, or every
	// later mount of CheckOAuth no-ops forever (Gemini PRRT_kwDODRu1TM6ocSFz). `navigate` rejecting
	// on the first mount's `await navigate(...)` stands in for any of navigate/router.invalidate/
	// queryClient.invalidateQueries — all equally unguarded by a try/finally before this fix.
	it('releases the lock when an awaited call rejects, so a later mount runs the check again', async () => {
		stubLocationSearch('');
		getCurrentUser.mockResolvedValue(null);
		const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		navigate.mockRejectedValueOnce(new Error('navigation aborted'));

		const { unmount } = renderCheckOAuth();
		await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
		// Let the rejection propagate through the finally (releases the lock) and the
		// outer .catch (logs via console.debug, not console.error — see CheckOAuth.tsx).
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

	// Codex (pre-push review) found that a SYNCHRONOUS throw before the first `await` — the only
	// candidate is clearOAuthErrorParamsFromUrl's history.replaceState, which some browsers throttle
	// into throwing — ran the try/finally's `checking = null` *before* `checking = <the IIFE's
	// promise>` had been assigned (an async function body runs synchronously up to its first await),
	// so the later assignment clobbered the lock back on with nothing left to ever release it.
	// Deferring the whole body through `Promise.resolve().then(...)` guarantees the assignment
	// completes first. Verified to fail without that deferral (reproduced the exact sequence in an
	// isolated Node script before applying the fix).
	it('releases the lock even when clearOAuthErrorParamsFromUrl throws synchronously, before any await', async () => {
		stubLocationSearch('');
		getCurrentUser.mockResolvedValue(null);
		const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		clearOAuthErrorParamsFromUrl.mockImplementationOnce(() => {
			throw new Error('history.replaceState throttled');
		});

		const { unmount } = renderCheckOAuth();
		await waitFor(() =>
			expect(consoleDebug).toHaveBeenCalledWith(
				'OAuth sign-in check failed, carrying on:',
				expect.objectContaining({ message: 'history.replaceState throttled' }),
			)
		);
		expect(navigate).not.toHaveBeenCalled();
		unmount();

		renderCheckOAuth();
		await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(1));
		consoleDebug.mockRestore();
	});
});
