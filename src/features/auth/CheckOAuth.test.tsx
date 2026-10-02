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
