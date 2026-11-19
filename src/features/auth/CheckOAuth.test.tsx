/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => navigate,
	Link: ({ children, search }: PropsWithChildren<{ search?: { redirect?: string } }>) => (
		<a data-redirect={search?.redirect}>{children}</a>
	),
}));

vi.mock('sonner', () => ({
	toast: { error: vi.fn() },
}));

const { fetchCurrentUser } = vi.hoisted(() => ({ fetchCurrentUser: vi.fn() }));
vi.mock('@/features/auth/queries/getCurrentUser', () => ({ fetchCurrentUser }));

// The counters a sign-out or another sign-in advances.
const { counters } = vi.hoisted(() => ({ counters: { signOutGeneration: 0, signInRevision: 0 } }));
vi.mock('@/features/auth/store/authStore', () => ({
	authStore: {
		getSignOutGeneration: () => counters.signOutGeneration,
		getSignInRevision: () => counters.signInRevision,
	},
	OverallAppSignIn: 'OverallAppSignIn',
}));

// Publishing the user, the bookkeeping and following the redirect are the shared completion's, tested with it.
const { completeSignIn, completeOptions } = vi.hoisted(() => ({
	completeSignIn: vi.fn(),
	completeOptions: { current: undefined as { redirect: unknown } | undefined },
}));
vi.mock('./hooks/useCloudSignIn', () => ({
	useCompleteCloudSignIn: (options: { redirect: unknown }) => {
		completeOptions.current = options;
		return completeSignIn;
	},
}));

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

const user = { id: 'u1', email: 'user@example.com' };

function stubLocation(search: string, hash = '#/check-oauth') {
	vi.stubGlobal('location', { ...window.location, search, hash });
}

beforeEach(() => {
	counters.signOutGeneration = 0;
	counters.signInRevision = 0;
	completeOptions.current = undefined;
	completeSignIn.mockReset().mockResolvedValue(true);
	fetchCurrentUser.mockReset();
	navigate.mockReset().mockResolvedValue(undefined);
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
	it('shows the reason-specific message and skips the session check when the redirect carries error/reason', async () => {
		stubLocation('?error=access_denied&reason=email_not_verified');
		render(<CheckOAuth />);

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));

		expect(toast.error).toHaveBeenCalledWith(
			'Verify your email address before signing in with this provider.',
			{ duration: 10_000 },
		);
		expect(fetchCurrentUser).not.toHaveBeenCalled();
		expect(clearOAuthErrorParamsFromUrl).toHaveBeenCalled();
	});

	it('falls back to the generic message for an unrecognized error/reason pair', async () => {
		stubLocation('?error=something_new&reason=also_new');
		render(<CheckOAuth />);

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));
		expect(toast.error).toHaveBeenCalledWith(OAUTH_GENERIC_ERROR_MESSAGE, { duration: 10_000 });
		expect(fetchCurrentUser).not.toHaveBeenCalled();
	});

	it('checks for a session and uses the generic toast when there is no error param and no session', async () => {
		stubLocation('');
		fetchCurrentUser.mockRejectedValue(new Error('not signed in'));
		render(<CheckOAuth />);

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));
		expect(fetchCurrentUser).toHaveBeenCalledTimes(1);
		expect(toast.error).toHaveBeenCalledWith(OAUTH_GENERIC_ERROR_MESSAGE, { duration: 10_000 });
		expect(completeSignIn).not.toHaveBeenCalled();
	});

	it('completes the sign-in when there is no error param and a session', async () => {
		stubLocation('');
		fetchCurrentUser.mockResolvedValue(user);
		render(<CheckOAuth />);

		await waitFor(() => expect(completeSignIn).toHaveBeenCalledExactlyOnceWith(user));
		expect(toast.error).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	// `checking` is a module-level lock; it must release even when navigate rejects, or every later mount is a
	// permanent no-op.
	it('releases the lock when an awaited call rejects, so a later mount runs the check again', async () => {
		stubLocation('');
		fetchCurrentUser.mockResolvedValue(null);
		const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		navigate.mockRejectedValueOnce(new Error('navigation aborted'));

		const { unmount } = render(<CheckOAuth />);
		await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
		await waitFor(() =>
			expect(consoleDebug).toHaveBeenCalledWith('OAuth sign-in check failed, carrying on:', expect.any(Error))
		);
		unmount();

		fetchCurrentUser.mockClear();
		navigate.mockClear();
		render(<CheckOAuth />);

		await waitFor(() => expect(fetchCurrentUser).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));
		consoleDebug.mockRestore();
	});

	// clearOAuthErrorParamsFromUrl's history.replaceState can throw synchronously (some browsers
	// throttle it); the rest of the check (here, the no-error-param path) must still run on the
	// same mount, logged separately from the check's own outer failure handler.
	it('keeps checking on the same mount when clearOAuthErrorParamsFromUrl throws synchronously', async () => {
		stubLocation('');
		fetchCurrentUser.mockResolvedValue(null);
		const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		clearOAuthErrorParamsFromUrl.mockImplementationOnce(() => {
			throw new Error('history.replaceState throttled');
		});

		render(<CheckOAuth />);

		await waitFor(() =>
			expect(consoleDebug).toHaveBeenCalledWith(
				'Failed to clear OAuth error params from the URL, carrying on:',
				expect.objectContaining({ message: 'history.replaceState throttled' }),
			)
		);
		await waitFor(() => expect(fetchCurrentUser).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));
		consoleDebug.mockRestore();
	});

	// Cursor Grok (pre-push review): the same throw, but with an error param present, must not
	// skip the one thing this component exists to do — show the mapped message and redirect.
	it('still shows the mapped message when clearOAuthErrorParamsFromUrl throws on a failed redirect', async () => {
		stubLocation('?error=access_denied&reason=email_not_verified');
		const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		clearOAuthErrorParamsFromUrl.mockImplementationOnce(() => {
			throw new Error('history.replaceState throttled');
		});

		render(<CheckOAuth />);

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));
		expect(toast.error).toHaveBeenCalledWith(
			'Verify your email address before signing in with this provider.',
			{ duration: 10_000 },
		);
		expect(fetchCurrentUser).not.toHaveBeenCalled();
		consoleDebug.mockRestore();
	});
});

describe('CheckOAuth redirect', () => {
	const mcpAuthorize = '/oauth/mcp/authorize?response_type=code&client_id=c&state=original-state';
	const withRedirect = `#/check-oauth?redirect=${encodeURIComponent(mcpAuthorize)}`;

	it('hands the fragment’s redirect to the sign-in completion', async () => {
		stubLocation('', withRedirect);
		fetchCurrentUser.mockResolvedValue(user);
		render(<CheckOAuth />);

		await waitFor(() => expect(completeSignIn).toHaveBeenCalledExactlyOnceWith(user));
		expect(completeOptions.current).toEqual({ redirect: mcpAuthorize });
		expect(navigate).not.toHaveBeenCalled();
	});

	// The hash history appends the pre-hash query to the fragment's, so the router's own search would read
	// `state=original-state?error=access_denied` here.
	it('keeps the redirect intact when the plugin’s error params precede the hash', async () => {
		stubLocation('?error=access_denied&reason=email_not_verified', withRedirect);
		render(<CheckOAuth />);

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in', search: { redirect: mcpAuthorize } }));
		expect(screen.getByText('Try signing in again').closest('a')?.dataset.redirect).toBe(mcpAuthorize);
	});

	it('keeps it when no session came back', async () => {
		stubLocation('', withRedirect);
		fetchCurrentUser.mockResolvedValue(null);
		render(<CheckOAuth />);

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in', search: { redirect: mcpAuthorize } }));
		expect(completeSignIn).not.toHaveBeenCalled();
	});

	it('carries on none it would not follow', async () => {
		stubLocation('?error=access_denied', `#/check-oauth?redirect=${encodeURIComponent('//evil.example')}`);
		render(<CheckOAuth />);

		await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
		expect(navigate.mock.calls[0][0]).toEqual({ to: '/sign-in' });
	});

	it.each([
		['a sign-out', () => counters.signOutGeneration++],
		['another sign-in', () => counters.signInRevision++],
	])('abandons the callback when %s lands while the session is checked', async (_label, supersede) => {
		stubLocation('', withRedirect);
		fetchCurrentUser.mockImplementation(async () => {
			supersede();
			return user;
		});
		render(<CheckOAuth />);

		await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
		// Neither published nor resumed, and the way back carries no authorization to resume.
		expect(completeSignIn).not.toHaveBeenCalled();
		expect(navigate.mock.calls[0][0]).toEqual({ to: '/sign-in' });
	});

	it('goes back to sign-in without the redirect when the completion gives up', async () => {
		stubLocation('', withRedirect);
		fetchCurrentUser.mockResolvedValue(user);
		completeSignIn.mockResolvedValue(false);
		render(<CheckOAuth />);

		await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
		expect(navigate.mock.calls[0][0]).toEqual({ to: '/sign-in' });
	});
});

describe('CheckOAuth sign-in handoff', () => {
	it('clears the code from the URL, redeems it, then signs in with the session it made', async () => {
		stubLocation('');
		readOAuthHandoffCodeFromUrl.mockReturnValue('code-1');
		const order: string[] = [];
		clearOAuthHandoffCodeFromUrl.mockImplementation(() => order.push('clear'));
		redeemOAuthHandoff.mockImplementation(async () => {
			order.push('redeem');
		});
		fetchCurrentUser.mockImplementation(async () => {
			order.push('fetchCurrentUser');
			return user;
		});

		render(<CheckOAuth />);

		await waitFor(() => expect(completeSignIn).toHaveBeenCalledExactlyOnceWith(user));
		expect(redeemOAuthHandoff).toHaveBeenCalledExactlyOnceWith('code-1');
		expect(order).toEqual(['clear', 'redeem', 'fetchCurrentUser']);
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('still checks for a session when the redeem is refused', async () => {
		stubLocation('');
		const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		readOAuthHandoffCodeFromUrl.mockReturnValue('code-1');
		redeemOAuthHandoff.mockRejectedValue(new Error('refused (400)'));
		fetchCurrentUser.mockResolvedValue(null);

		render(<CheckOAuth />);

		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));
		expect(fetchCurrentUser).toHaveBeenCalledTimes(1);
		expect(toast.error).toHaveBeenCalledWith(OAUTH_GENERIC_ERROR_MESSAGE, { duration: 10_000 });
		expect(consoleDebug).toHaveBeenCalledWith(
			'OAuth sign-in handoff failed, checking for a session anyway:',
			expect.objectContaining({ message: 'refused (400)' }),
		);
		consoleDebug.mockRestore();
	});

	it('still redeems when clearing the code from the URL throws', async () => {
		stubLocation('');
		const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		readOAuthHandoffCodeFromUrl.mockReturnValue('code-1');
		clearOAuthHandoffCodeFromUrl.mockImplementation(() => {
			throw new Error('history.replaceState throttled');
		});
		fetchCurrentUser.mockResolvedValue(user);

		render(<CheckOAuth />);

		await waitFor(() => expect(completeSignIn).toHaveBeenCalledExactlyOnceWith(user));
		expect(redeemOAuthHandoff).toHaveBeenCalledExactlyOnceWith('code-1');
		consoleDebug.mockRestore();
	});

	it('redeems nothing without a code, or when the redirect carries an error', async () => {
		stubLocation('');
		fetchCurrentUser.mockResolvedValue(user);
		const { unmount } = render(<CheckOAuth />);
		await waitFor(() => expect(completeSignIn).toHaveBeenCalledTimes(1));
		unmount();

		stubLocation('?error=auth_failed&reason=token_exchange');
		readOAuthHandoffCodeFromUrl.mockReturnValue('code-1');
		render(<CheckOAuth />);
		await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' }));

		expect(redeemOAuthHandoff).not.toHaveBeenCalled();
	});
});
