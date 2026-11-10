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

// One navigate and one router for the whole file, matching production's stable ones: both sit in dependency arrays.
const { navigate, router, search } = vi.hoisted(() => ({
	navigate: vi.fn(),
	router: { invalidate: vi.fn() },
	search: { token: undefined as unknown },
}));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => navigate,
	useRouter: () => router,
	useSearch: () => search,
	Link: ({ children, to, state, className }: PropsWithChildren<
		{ to?: string; state?: { prefillEmail?: string }; className?: string }
	>) => <a href={to} data-prefill-email={state?.prefillEmail} className={className}>{children}</a>,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() } }));

const { fetchCurrentUser } = vi.hoisted(() => ({ fetchCurrentUser: vi.fn() }));
vi.mock('@/features/auth/queries/getCurrentUser', () => ({ fetchCurrentUser, currentUserQueryKey: ['current-user'] }));
vi.mock('@/integrations/datadog/datadog', () => ({ loginSuccessDatadogAction: vi.fn() }));
vi.mock('@/integrations/reo/reo', () => ({ reoClient: undefined }));
vi.mock('./handlers/clearAuthStateLocally', async (importOriginal) => ({
	...await importOriginal<typeof import('./handlers/clearAuthStateLocally')>(),
	clearPreviousAccount: vi.fn(async () => {}),
}));
vi.mock('@/lib/urls/getDefaultSignedInCloudRouteForUser', () => ({
	getDefaultSignedInCloudRouteForUser: () => '/default-org',
}));

import { authStore } from '@/features/auth/store/authStore';
import { loginSuccessDatadogAction } from '@/integrations/datadog/datadog';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
// The app's own routing, so a failure that also reached the global toast would show up here.
import { mutationErrorHandler } from '@/react-query/queryClient';
import { toast } from 'sonner';
import { OFFLINE_MESSAGE } from './failFastOffline';
import { clearPreviousAccount } from './handlers/clearAuthStateLocally';
import { readSignUpBrowserProofFor, SIGN_UP_BROWSER_PROOF_TTL_MS, storeSignUpBrowserProof } from './signUpBrowserProof';
import { VerifyEmail } from './VerifyEmail';

const UNCONFIRMED = /couldn't confirm your email was verified\. Your link still works/;
const SIGNED_UP_EMAIL = 'ada@example.com';
const USER = { id: 'u1', email: SIGNED_UP_EMAIL };

// The shape axios rejects with: `isUnansweredWrite` needs the request's `config`.
const verifyRequest = { method: 'put', url: '/VerifyEmail/' };

function axiosError(status: number, data?: unknown, config: object = verifyRequest): AxiosError {
	return {
		isAxiosError: true,
		code: 'ERR_BAD_RESPONSE',
		message: `Request failed with status code ${status}`,
		config,
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

function answer(outcome?: string, signedIn?: boolean, email = SIGNED_UP_EMAIL) {
	return {
		data: {
			userId: 'u1',
			email,
			...(outcome === undefined ? {} : { outcome }),
			...(signedIn === undefined ? {} : { signedIn }),
		},
	};
}

const OTHER_EMAIL = 'grace@example.com';

function storeProof(email = SIGNED_UP_EMAIL, proof = 'browser-proof', now = Date.now()) {
	storeSignUpBrowserProof(proof, email, now);
}

function storedProof() {
	return localStorage.getItem(LocalStorageKeys.SignUpBrowserProof);
}

let queryClient: QueryClient;

function page(): ReactNode {
	return (
		<QueryClientProvider client={queryClient}>
			<VerifyEmail />
		</QueryClientProvider>
	);
}

// The address rides in history state, never the URL: every analytics pixel reads the URL.
function linkTarget(name: string) {
	const link = screen.getByRole('link', { name });
	return { href: link.getAttribute('href'), prefillEmail: link.getAttribute('data-prefill-email') };
}

function signInLinks() {
	return { signIn: linkTarget('Back to sign in'), forgotPassword: linkTarget('Forgot password?') };
}

const PREFILLED = {
	signIn: { href: '/sign-in', prefillEmail: SIGNED_UP_EMAIL },
	forgotPassword: { href: '/forgot-password', prefillEmail: SIGNED_UP_EMAIL },
};
const NOT_PREFILLED = {
	signIn: { href: '/sign-in', prefillEmail: null },
	forgotPassword: { href: '/forgot-password', prefillEmail: null },
};

function enterPassword(password: string) {
	fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
	fireEvent.click(screen.getByRole('button', { name: 'Verify Email' }));
}

function chooseNewPassword(password: string, confirmation = password) {
	fireEvent.click(screen.getByRole('button', { name: 'Forgot it? Choose a new password' }));
	fireEvent.change(screen.getByLabelText('New Password'), { target: { value: password } });
	fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: confirmation } });
	fireEvent.click(screen.getByRole('button', { name: 'Set Password and Verify' }));
}

async function expectSignedIntoApp() {
	await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/default-org' }));
	expect(authStore.setUserForEntity).toHaveBeenCalledWith('OverallAppSignIn', USER);
	expect(router.invalidate).toHaveBeenCalled();
	expect(toast.success).toHaveBeenCalledWith(
		'Success',
		expect.objectContaining({ description: 'Email verified successfully' }),
	);
}

beforeEach(() => {
	// mockReset, not the afterEach mockClear: a queued mockResolvedValueOnce would otherwise answer the next test.
	put.mockReset();
	post.mockReset();
	fetchCurrentUser.mockReset();
	localStorage.clear();
	queryClient = new QueryClient({ mutationCache: new MutationCache({ onError: mutationErrorHandler }) });
	search.token = 'verify-token';
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'debug').mockImplementation(() => {});
	vi.spyOn(authStore, 'setUserForEntity').mockImplementation(() => {});
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

describe('VerifyEmail with a token and this browser’s sign-up proof', () => {
	beforeEach(() => storeProof());

	it('sends the proof with the token, and shows "Verifying" instead of flashing a form', async () => {
		put.mockReturnValue(new Promise(() => {}));
		render(page());

		expect(screen.getByRole('status').textContent).toBe('Verifying email...');
		await waitFor(() =>
			expect(put).toHaveBeenCalledWith('/VerifyEmail/', { token: 'verify-token', browserProof: 'browser-proof' })
		);
		expect(screen.getByRole('status').textContent).toBe('Verifying email...');
		expect(screen.queryByLabelText('Password')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Send Verification Email' })).toBeNull();
	});

	it('takes a verify that opened a session into the app, as a sign-in does, and forgets the proof', async () => {
		put.mockResolvedValue(answer('verified', true));
		fetchCurrentUser.mockResolvedValue(USER);
		render(page());

		await expectSignedIntoApp();
		expect(storedProof()).toBeNull();
		expect(post).not.toHaveBeenCalled();
	});

	it('says "Signing you in" while it loads the user', async () => {
		put.mockResolvedValue(answer('verified', true));
		fetchCurrentUser.mockReturnValue(new Promise(() => {}));
		render(page());

		await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Signing you in...'));
		expect(navigate).not.toHaveBeenCalled();
	});

	it('asks them to sign in when the session it opened can’t be loaded', async () => {
		put.mockResolvedValue(answer('verified', true));
		const rejection = axiosError(401, undefined, { method: 'get', url: '/User/current' });
		fetchCurrentUser.mockRejectedValue(rejection);
		render(page());

		expect(await screen.findByText('Sign in to continue.')).toBeTruthy();
		expect(console.error).toHaveBeenCalledWith(rejection);
		expect(navigate).not.toHaveBeenCalled();
	});

	it('asks them to sign in, with the address filled in, when central-manager opened no session', async () => {
		put.mockResolvedValue(answer('verified', false));
		render(page());

		expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeTruthy();
		expect(screen.getByText('Sign in to continue.')).toBeTruthy();
		expect(storedProof()).toBeNull();
		expect(fetchCurrentUser).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
		expect(navigate).toHaveBeenCalledWith({ to: '/sign-in', state: { prefillEmail: SIGNED_UP_EMAIL } });
		expect(linkTarget('Forgot password?')).toEqual(PREFILLED.forgotPassword);
	});

	it('asks for the password when central-manager rejects the proof, and forgets it', async () => {
		put.mockResolvedValue(answer('password_required', false));
		render(page());

		expect(await screen.findByText('Enter the password you chose when you signed up.')).toBeTruthy();
		expect(screen.getByText(SIGNED_UP_EMAIL).tagName).toBe('STRONG');
		expect((screen.getByLabelText('Password') as HTMLInputElement).autocomplete).toBe('current-password');
		expect(storedProof()).toBeNull();
		expect(put).toHaveBeenCalledTimes(1);
	});

	// Sign up Ada, then Grace, then open Ada's link: Grace's proof is the newest, and goes first.
	it('resends with the proof for the account central-manager names, keeping the other one', async () => {
		storeProof(OTHER_EMAIL, 'grace-proof', Date.now() + 1_000);
		put.mockResolvedValueOnce(answer('password_required', false)).mockResolvedValueOnce(answer('verified', false));
		render(page());

		expect(await screen.findByText('Sign in to continue.')).toBeTruthy();
		expect(put.mock.calls.map(([, body]) => body)).toEqual([
			{ token: 'verify-token', browserProof: 'grace-proof' },
			{ token: 'verify-token', browserProof: 'browser-proof' },
		]);
		expect(readSignUpBrowserProofFor(SIGNED_UP_EMAIL)).toBeNull();
		expect(readSignUpBrowserProofFor(OTHER_EMAIL)).toMatchObject({ proof: 'grace-proof' });
	});

	it('does not resend with the account’s own proof after a sign-out lands', async () => {
		storeProof(OTHER_EMAIL, 'grace-proof', Date.now() + 1_000);
		let resolve!: (value: unknown) => void;
		put.mockReturnValue(new Promise((r) => (resolve = r)));
		const generation = vi.spyOn(authStore, 'getSignOutGeneration').mockReturnValue(1);
		render(page());
		await waitFor(() => expect(put).toHaveBeenCalled());

		generation.mockReturnValue(2);
		await act(async () => resolve(answer('password_required', false)));

		expect(put).toHaveBeenCalledTimes(1);
		expect(screen.getByText('Enter the password you chose when you signed up.')).toBeTruthy();
	});

	it('labels the password form with the link’s account, not another sign-up’s, and keeps that one’s proof', async () => {
		localStorage.clear();
		storeProof(OTHER_EMAIL, 'grace-proof');
		put.mockResolvedValue(answer('password_required', false));
		render(page());

		expect(await screen.findByText('Enter the password you chose when you signed up.')).toBeTruthy();
		expect(screen.getByText(SIGNED_UP_EMAIL).tagName).toBe('STRONG');
		expect(screen.queryByText(OTHER_EMAIL)).toBeNull();
		expect((document.querySelector('input[autocomplete="username"]') as HTMLInputElement).value).toBe(SIGNED_UP_EMAIL);
		expect(readSignUpBrowserProofFor(OTHER_EMAIL)).toMatchObject({ proof: 'grace-proof' });
		expect(put).toHaveBeenCalledTimes(1);
	});

	it('ignores a session it loads for a link the route has since dropped', async () => {
		put.mockResolvedValue(answer('verified', true));
		const syncAppUser = vi.spyOn(authStore, 'syncAppUser');
		let resolveUser!: (user: unknown) => void;
		fetchCurrentUser.mockReturnValue(new Promise((r) => (resolveUser = r)));
		const { rerender } = render(page());
		await waitFor(() => expect(fetchCurrentUser).toHaveBeenCalled());

		search.token = undefined;
		rerender(page());
		await act(async () => resolveUser(USER));

		expect(authStore.setUserForEntity).not.toHaveBeenCalled();
		expect(syncAppUser).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
		expect(toast.success).not.toHaveBeenCalled();
	});

	it('ignores a session it loads after the page unmounts', async () => {
		put.mockResolvedValue(answer('verified', true));
		let resolveUser!: (user: unknown) => void;
		fetchCurrentUser.mockReturnValue(new Promise((r) => (resolveUser = r)));
		const { unmount } = render(page());
		await waitFor(() => expect(fetchCurrentUser).toHaveBeenCalled());

		unmount();
		await act(async () => resolveUser(USER));

		expect(authStore.setUserForEntity).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	it('ignores a session it loads for a link that left and came back', async () => {
		put.mockResolvedValue(answer('verified', true));
		let resolveUser!: (user: unknown) => void;
		fetchCurrentUser.mockReturnValue(new Promise((r) => (resolveUser = r)));
		const { rerender } = render(page());
		await waitFor(() => expect(fetchCurrentUser).toHaveBeenCalled());

		search.token = undefined;
		rerender(page());
		search.token = 'verify-token';
		rerender(page());
		await act(async () => resolveUser(USER));

		expect(authStore.setUserForEntity).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	it('does not navigate when a sign-out lands while the session is being taken into the app', async () => {
		put.mockResolvedValue(answer('verified', true));
		fetchCurrentUser.mockResolvedValue(USER);
		let generation = 1;
		vi.spyOn(authStore, 'getSignOutGeneration').mockImplementation(() => generation);
		vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async () => {
			generation = 2;
		});
		render(page());

		expect(await screen.findByText('Sign in to continue.')).toBeTruthy();
		expect(authStore.setUserForEntity).toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	it('ignores a session it loads after a sign-out', async () => {
		put.mockResolvedValue(answer('verified', true));
		let resolveUser!: (user: unknown) => void;
		fetchCurrentUser.mockReturnValue(new Promise((r) => (resolveUser = r)));
		const generation = vi.spyOn(authStore, 'getSignOutGeneration').mockReturnValue(1);
		render(page());
		await waitFor(() => expect(fetchCurrentUser).toHaveBeenCalled());

		generation.mockReturnValue(2);
		await act(async () => resolveUser(USER));

		expect(authStore.setUserForEntity).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
		expect(screen.getByText('Sign in to continue.')).toBeTruthy();
	});

	it.each(['getSignOutGeneration', 'getSignInRevision'] as const)(
		'ignores an answer that arrives after a sign-out or another sign-in (%s moved while it was out)',
		async (counter) => {
			let resolve!: (value: unknown) => void;
			put.mockReturnValue(new Promise((r) => (resolve = r)));
			const moved = vi.spyOn(authStore, counter).mockReturnValue(1);
			render(page());
			await waitFor(() => expect(put).toHaveBeenCalled());

			moved.mockReturnValue(2);
			await act(async () => resolve(answer('verified', true)));

			expect(fetchCurrentUser).not.toHaveBeenCalled();
			expect(authStore.setUserForEntity).not.toHaveBeenCalled();
			expect(navigate).not.toHaveBeenCalled();
			expect(screen.getByText('Sign in to continue.')).toBeTruthy();
		},
	);

	it('does not take them into an account other than the one it verified', async () => {
		put.mockResolvedValue(answer('verified', true));
		fetchCurrentUser.mockResolvedValue({ id: 'u2', email: OTHER_EMAIL });
		render(page());

		expect(await screen.findByText('Sign in to continue.')).toBeTruthy();
		expect(authStore.setUserForEntity).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	it('still takes them into the app when sign-in analytics throw', async () => {
		put.mockResolvedValue(answer('verified', true));
		fetchCurrentUser.mockResolvedValue(USER);
		vi.mocked(loginSuccessDatadogAction).mockImplementationOnce(() => {
			throw new Error('RUM not initialised');
		});
		render(page());

		await expectSignedIntoApp();
	});

	it('asks them to sign in when taking the session into the app throws', async () => {
		put.mockResolvedValue(answer('verified', true));
		fetchCurrentUser.mockResolvedValue(USER);
		const failure = new Error('replaceState throttled');
		vi.mocked(authStore.setUserForEntity).mockImplementation(() => {
			throw failure;
		});
		render(page());

		expect(await screen.findByText('Sign in to continue.')).toBeTruthy();
		expect(console.error).toHaveBeenCalledWith(failure);
	});

	// A central-manager without #781's change verified on the token alone, and opened no session.
	it('asks them to sign in after a verify with no outcome', async () => {
		put.mockResolvedValue(answer());
		render(page());

		expect(await screen.findByText('Sign in to continue.')).toBeTruthy();
		expect(storedProof()).toBeNull();
		expect(post).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	// A repeat visit, after which the sign-up password may already have been replaced.
	it('stays on the page for already_verified, pointing at the set-password email, without claiming a password was saved', async () => {
		put.mockResolvedValue(answer('already_verified', false));
		render(page());

		expect(await screen.findByRole('heading', { name: 'Already verified' })).toBeTruthy();
		const status = screen.getByRole('status').textContent ?? '';
		expect(status).toMatch(/If we emailed you a link to set your password, use it before signing in\./);
		expect(status).toMatch(/use Forgot Password/);
		expect(status).not.toMatch(/successfully|password (?:was|has been) (?:set|saved)/i);
		expect(signInLinks()).toEqual(PREFILLED);
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
		expect(signInLinks()).toEqual(PREFILLED);
		expect(navigate).not.toHaveBeenCalled();
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

		it('and again for a different token, which a spent proof leaves to the password', async () => {
			put.mockResolvedValue(answer('reset_email_sent'));
			const { rerender } = render(page());
			await screen.findByText('Check your inbox to set your password.');

			search.token = 'another-token';
			rerender(page());

			expect(await screen.findByText('Enter the password you chose when you signed up.')).toBeTruthy();
			expect(put).toHaveBeenCalledTimes(1);
		});

		it('and sends a proof again for a token that comes back after another', async () => {
			put.mockResolvedValueOnce(answer('password_required')).mockResolvedValueOnce(answer('already_verified'));
			const { rerender } = render(page());
			await screen.findByText('Enter the password you chose when you signed up.');
			search.token = 'another-token';
			rerender(page());
			storeProof();

			search.token = 'verify-token';
			rerender(page());

			expect(await screen.findByRole('heading', { name: 'Already verified' })).toBeTruthy();
			expect(put).toHaveBeenLastCalledWith('/VerifyEmail/', { token: 'verify-token', browserProof: 'browser-proof' });
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

		it('says the link still works and offers a retry instead of a new link, with no toast, keeping the proof', async () => {
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
			expect(storedProof()).not.toBeNull();
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

		it('resubmits the same proof on Try again', async () => {
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
			expect(put).toHaveBeenCalledWith('/VerifyEmail/', { token: 'verify-token', browserProof: 'browser-proof' });
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
			expect(signInLinks()).toEqual(NOT_PREFILLED);
			expect(put).toHaveBeenCalledTimes(1);
			expect(toast.error).not.toHaveBeenCalled();
		},
	);

	describe('sent while offline', () => {
		beforeEach(() => {
			onlineManager.setOnline(false);
		});

		afterEach(() => {
			onlineManager.setOnline(true);
		});

		it('says so and keeps the link, then resubmits the same proof on Try again once back online', async () => {
			put.mockRejectedValueOnce(offlineRejection).mockResolvedValueOnce(answer('reset_email_sent'));
			render(page());

			expect((await screen.findByRole('alert')).textContent).toBe(OFFLINE_MESSAGE);
			expect(screen.queryByRole('button', { name: 'Send Verification Email' })).toBeNull();
			expect(signInLinks()).toEqual(NOT_PREFILLED);
			expect(toast.error).not.toHaveBeenCalled();
			// Being offline is not a Studio failure: `console.error` would file it in RUM.
			expect(console.error).not.toHaveBeenCalled();

			onlineManager.setOnline(true);
			fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

			expect(await screen.findByText('Check your inbox to set your password.')).toBeTruthy();
			expect(put).toHaveBeenCalledTimes(2);
			expect(put).toHaveBeenLastCalledWith('/VerifyEmail/', { token: 'verify-token', browserProof: 'browser-proof' });
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
		await act(async () => resolve(answer('verified', true)));

		expect(screen.getByRole('button', { name: 'Send Verification Email' })).toBeTruthy();
		expect(fetchCurrentUser).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
		expect(storedProof()).not.toBeNull();
	});

	it.each([
		['an invalid or expired link', 401, { title: 'Invalid or expired verify token' }],
		['an account still signing up', 403, { title: 'Finish signing up before verifying your email' }],
	])('toasts %s and falls back to requesting a new link, keeping the proof for it', async (_case, status, data) => {
		put.mockRejectedValue(axiosError(status, data));
		render(page());

		expect(await screen.findByRole('button', { name: 'Send Verification Email' })).toBeTruthy();
		expect(toast.error).toHaveBeenCalledTimes(1);
		expect(put).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
		expect(storedProof()).not.toBeNull();
	});
});

describe('VerifyEmail with a token and no sign-up proof', () => {
	// What a mail scanner opening the link sees: it no longer verifies the email by itself.
	it('asks for the sign-up password and sends nothing', () => {
		render(page());

		expect(screen.getByText('Enter the password you chose when you signed up.')).toBeTruthy();
		const password = screen.getByLabelText('Password') as HTMLInputElement;
		expect(password.autocomplete).toBe('current-password');
		expect(screen.queryByText(/Signed up as/)).toBeNull();
		expect(put).not.toHaveBeenCalled();
	});

	it('treats an expired proof as none, and forgets it', () => {
		storeProof(SIGNED_UP_EMAIL, 'browser-proof', Date.now() - SIGN_UP_BROWSER_PROOF_TTL_MS - 1);
		render(page());

		expect(screen.getByLabelText('Password')).toBeTruthy();
		expect(put).not.toHaveBeenCalled();
		expect(storedProof()).toBeNull();
	});

	it('requires a password before sending one', async () => {
		render(page());
		fireEvent.click(screen.getByRole('button', { name: 'Verify Email' }));

		expect(await screen.findByText('Please enter your password.')).toBeTruthy();
		expect(put).not.toHaveBeenCalled();
	});

	it('sends the password with the token, keeps the form while it is out, and signs in on the session it opened', async () => {
		let resolve!: (value: unknown) => void;
		put.mockReturnValue(new Promise((r) => (resolve = r)));
		fetchCurrentUser.mockResolvedValue(USER);
		render(page());

		enterPassword('correct horse');

		await waitFor(() =>
			expect(put).toHaveBeenCalledWith('/VerifyEmail/', { token: 'verify-token', password: 'correct horse' })
		);
		expect((screen.getByRole('button', { name: 'Verify Email' }) as HTMLButtonElement).disabled).toBe(true);
		await act(async () => resolve(answer('verified', true)));

		await expectSignedIntoApp();
	});

	it('says a wrong password is wrong, on the field, offers a new one, and takes the right one next', async () => {
		put.mockResolvedValueOnce(answer('password_mismatch', false)).mockResolvedValueOnce(answer('verified', false));
		render(page());

		enterPassword('wrong horse');

		expect(await screen.findByText("That isn't the password you chose when you signed up.")).toBeTruthy();
		expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBe('true');
		expect(screen.getByRole('button', { name: 'Forgot it? Choose a new password' })).toBeTruthy();

		enterPassword('correct horse');

		expect(await screen.findByText('Sign in to continue.')).toBeTruthy();
		expect(put).toHaveBeenLastCalledWith('/VerifyEmail/', { token: 'verify-token', password: 'correct horse' });
	});

	it('labels the form with the account central-manager names after a wrong password', async () => {
		put.mockResolvedValue(answer('password_mismatch', false));
		render(page());

		enterPassword('wrong horse');

		expect(await screen.findByText(SIGNED_UP_EMAIL)).toBeTruthy();
	});

	it('does not flag the field again after they leave a wrong password for a new one and come back', async () => {
		put.mockResolvedValue(answer('password_mismatch', false));
		render(page());
		enterPassword('wrong horse');
		await screen.findByText("That isn't the password you chose when you signed up.");

		fireEvent.click(screen.getByRole('button', { name: 'Forgot it? Choose a new password' }));
		fireEvent.click(screen.getByRole('button', { name: 'Remember it? Enter your password instead' }));

		expect(screen.queryByText("That isn't the password you chose when you signed up.")).toBeNull();
		expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBe('false');
	});

	it('shows "Verifying" while Try again resends a new password', async () => {
		put.mockRejectedValueOnce(axiosError(502)).mockReturnValueOnce(new Promise(() => {}));
		render(page());

		chooseNewPassword('battery staple');
		fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

		await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
		expect(screen.getByRole('status').textContent).toBe('Verifying email...');
		expect(put).toHaveBeenLastCalledWith('/VerifyEmail/', { token: 'verify-token', newPassword: 'battery staple' });
	});

	describe('choosing a new password', () => {
		it.each([
			['a short one', 'short', 'short', 'Password must be at least 8 characters long.'],
			['a mismatched confirmation', 'correct horse', 'correct house', 'Passwords do not match.'],
		])('refuses %s before sending it', async (_case, password, confirmation, message) => {
			render(page());
			chooseNewPassword(password, confirmation);

			expect(await screen.findByText(message)).toBeTruthy();
			expect(put).not.toHaveBeenCalled();
		});

		it('sends it as newPassword and signs in on the session it opened', async () => {
			put.mockResolvedValue(answer('password_set', true));
			fetchCurrentUser.mockResolvedValue(USER);
			render(page());

			chooseNewPassword('battery staple');

			await expectSignedIntoApp();
			expect(put).toHaveBeenCalledWith('/VerifyEmail/', { token: 'verify-token', newPassword: 'battery staple' });
		});

		it('asks them to sign in with it when central-manager opened no session', async () => {
			put.mockResolvedValue(answer('password_set', false));
			render(page());

			chooseNewPassword('battery staple');

			expect(await screen.findByText('Sign in with your new password.')).toBeTruthy();
			expect(fetchCurrentUser).not.toHaveBeenCalled();
		});

		// central-manager ignores a newPassword sent with a link older than its reset-token window.
		it('stays on the page for reset_email_sent and says the sign-up password was replaced', async () => {
			put.mockResolvedValue(answer('reset_email_sent', false));
			render(page());

			chooseNewPassword('battery staple');

			expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeTruthy();
			expect(screen.getByText(/the password you chose when signing up has been replaced/)).toBeTruthy();
			expect(screen.getByText(SIGNED_UP_EMAIL).tagName).toBe('STRONG');
			expect(screen.getByText('Check your inbox to set your password.')).toBeTruthy();
			expect(signInLinks()).toEqual(PREFILLED);
			expect(navigate).not.toHaveBeenCalled();
			expect(toast.success).not.toHaveBeenCalled();
		});

		it('points password_reset_required at Forgot Password', async () => {
			put.mockResolvedValue(answer('password_reset_required', false));
			render(page());

			chooseNewPassword('battery staple');

			expect(await screen.findByText('Set a new password to sign in.')).toBeTruthy();
			expect(screen.getByText(/couldn't send you a\s+link to set a new one\. Use Forgot Password to get one\./))
				.toBeTruthy();
			expect(signInLinks()).toEqual(PREFILLED);
			expect(navigate).not.toHaveBeenCalled();
		});

		it('goes back to the sign-up password on request', () => {
			render(page());
			fireEvent.click(screen.getByRole('button', { name: 'Forgot it? Choose a new password' }));
			fireEvent.click(screen.getByRole('button', { name: 'Remember it? Enter your password instead' }));

			expect(screen.getByText('Enter the password you chose when you signed up.')).toBeTruthy();
		});
	});

	describe('against a central-manager without #781’s change, which verifies on the token alone', () => {
		it('signs in with the password they typed', async () => {
			put.mockResolvedValue(answer());
			post.mockResolvedValue({ data: USER });
			render(page());

			enterPassword('correct horse');

			await expectSignedIntoApp();
			expect(toast.success).toHaveBeenCalledTimes(1);
			expect(post).toHaveBeenCalledWith('/Login/', { email: SIGNED_UP_EMAIL, password: 'correct horse' });
			expect(fetchCurrentUser).not.toHaveBeenCalled();
		});

		it('says the email is verified and shows why sign-in failed', async () => {
			put.mockResolvedValue(answer());
			post.mockRejectedValue(axiosError(401, { title: 'Invalid email or password' }, { url: '/Login/' }));
			render(page());

			enterPassword('wrong horse');

			expect(await screen.findByText('Sign in to continue.')).toBeTruthy();
			expect(screen.getByRole('alert').textContent).toBe('Invalid email or password');
			expect(navigate).not.toHaveBeenCalled();
		});

		it('drops a failed sign-in’s error when another link comes in', async () => {
			put.mockResolvedValue(answer());
			post.mockRejectedValue(axiosError(401, { title: 'Invalid email or password' }, { url: '/Login/' }));
			const { rerender } = render(page());
			enterPassword('wrong horse');
			await screen.findByText('Invalid email or password');

			search.token = 'another-token';
			rerender(page());
			chooseNewPassword('battery staple');

			expect(await screen.findByText(/We couldn't save your new password/)).toBeTruthy();
			expect(screen.queryByText('Invalid email or password')).toBeNull();
		});

		it('ignores a sign-in that answers after the link changed', async () => {
			put.mockResolvedValue(answer());
			let resolveLogin!: (value: unknown) => void;
			post.mockReturnValue(new Promise((r) => (resolveLogin = r)));
			const { rerender } = render(page());
			enterPassword('correct horse');
			await waitFor(() => expect(post).toHaveBeenCalled());

			search.token = 'another-token';
			rerender(page());
			await act(async () => resolveLogin({ data: USER }));

			expect(authStore.setUserForEntity).not.toHaveBeenCalled();
			expect(navigate).not.toHaveBeenCalled();
			expect(screen.getByText('Enter the password you chose when you signed up.')).toBeTruthy();
		});

		it('does not sign in when a sign-out lands while the verify is out', async () => {
			let resolve!: (value: unknown) => void;
			put.mockReturnValue(new Promise((r) => (resolve = r)));
			const generation = vi.spyOn(authStore, 'getSignOutGeneration').mockReturnValue(1);
			render(page());
			enterPassword('correct horse');
			await waitFor(() => expect(put).toHaveBeenCalled());

			generation.mockReturnValue(2);
			await act(async () => resolve(answer()));

			expect(post).not.toHaveBeenCalled();
			expect(screen.getByText('Sign in to continue.')).toBeTruthy();
		});

		it('does not take them in when a sign-out lands while the sign-in is out', async () => {
			put.mockResolvedValue(answer());
			let resolveLogin!: (value: unknown) => void;
			post.mockReturnValue(new Promise((r) => (resolveLogin = r)));
			const generation = vi.spyOn(authStore, 'getSignOutGeneration').mockReturnValue(1);
			render(page());
			enterPassword('correct horse');
			await waitFor(() => expect(post).toHaveBeenCalled());

			generation.mockReturnValue(2);
			await act(async () => resolveLogin({ data: USER }));

			expect(authStore.setUserForEntity).not.toHaveBeenCalled();
			expect(navigate).not.toHaveBeenCalled();
			expect(screen.getByText('Sign in to continue.')).toBeTruthy();
		});

		it('does not take them into an account other than the one it verified', async () => {
			put.mockResolvedValue(answer());
			post.mockResolvedValue({ data: { id: 'u2', email: OTHER_EMAIL } });
			render(page());

			enterPassword('correct horse');

			expect(await screen.findByText('Sign in to continue.')).toBeTruthy();
			expect(authStore.setUserForEntity).not.toHaveBeenCalled();
			expect(navigate).not.toHaveBeenCalled();
		});

		it('asks them to sign in when taking the signed-in user into the app throws', async () => {
			put.mockResolvedValue(answer());
			post.mockResolvedValue({ data: USER });
			vi.mocked(authStore.setUserForEntity).mockImplementation(() => {
				throw new Error('store refused');
			});
			render(page());

			enterPassword('correct horse');

			expect(await screen.findByText('Sign in to continue.')).toBeTruthy();
		});

		it('says a new password was not saved, and does not sign in with it', async () => {
			put.mockResolvedValue(answer());
			render(page());

			chooseNewPassword('battery staple');

			expect(await screen.findByText(/We couldn't save your new password/)).toBeTruthy();
			expect(post).not.toHaveBeenCalled();
			expect(navigate).not.toHaveBeenCalled();
		});
	});

	it('shows a new link’s form, not the answer for the link it replaced', async () => {
		let resolve!: (value: unknown) => void;
		put.mockReturnValue(new Promise((r) => (resolve = r)));
		const { rerender } = render(page());
		enterPassword('correct horse');
		await waitFor(() => expect(put).toHaveBeenCalledTimes(1));

		search.token = 'another-token';
		rerender(page());
		await act(async () => resolve(answer('verified', false)));

		expect(screen.getByText('Enter the password you chose when you signed up.')).toBeTruthy();
		expect(screen.queryByText('Sign in to continue.')).toBeNull();
	});

	it('resubmits the same password on Try again', async () => {
		put.mockRejectedValueOnce(axiosError(502)).mockResolvedValueOnce(answer('verified', false));
		render(page());

		enterPassword('correct horse');
		fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

		expect(await screen.findByText('Sign in to continue.')).toBeTruthy();
		expect(put).toHaveBeenCalledTimes(2);
		expect(put).toHaveBeenLastCalledWith('/VerifyEmail/', { token: 'verify-token', password: 'correct horse' });
	});

	// Tokens are JWTs, which the router's JSON parse never turns into anything else.
	it.each([12345, 0, true, null])('treats a search value the router parsed into %s as no token', (value) => {
		search.token = value;
		render(page());

		expect(screen.getByRole('button', { name: 'Send Verification Email' })).toBeTruthy();
		expect(put).not.toHaveBeenCalled();
	});
});

describe('VerifyEmail without a token', () => {
	it('asks for an address to send a new link to, and verifies nothing, even with a proof', () => {
		storeProof();
		search.token = undefined;
		render(page());

		expect(screen.getByText('Enter your email to receive a verification link.')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Send Verification Email' })).toBeTruthy();
		expect(put).not.toHaveBeenCalled();
		expect(storedProof()).not.toBeNull();
	});

	it('hands the address to sign-in in history state once the new link is sent', async () => {
		search.token = undefined;
		post.mockResolvedValue({ data: 'Check your inbox for a new link.' });
		render(page());

		fireEvent.change(screen.getByLabelText('Email'), { target: { value: SIGNED_UP_EMAIL } });
		fireEvent.click(screen.getByRole('button', { name: 'Send Verification Email' }));

		await waitFor(() =>
			expect(navigate).toHaveBeenCalledWith({ to: '/sign-in', state: { prefillEmail: SIGNED_UP_EMAIL } })
		);
		expect(post).toHaveBeenCalledWith('/ResendVerificationEmail/', { email: SIGNED_UP_EMAIL });
	});
});

// The verify page admits a signed-in visitor, and a session central-manager opens replaces theirs in the browser.
describe('VerifyEmail while this tab holds another account', () => {
	beforeEach(() => {
		storeProof();
		vi.spyOn(authStore, 'holdsAnotherAppUser').mockReturnValue(true);
	});

	it('ends the other account before taking them into the verified one', async () => {
		put.mockResolvedValue(answer('verified', true));
		fetchCurrentUser.mockResolvedValue(USER);
		render(page());

		await expectSignedIntoApp();
		expect(clearPreviousAccount).toHaveBeenCalledTimes(1);
	});

	it.each([
		['the session it opened can’t be loaded', () => fetchCurrentUser.mockRejectedValue(axiosError(500))],
		['the session is another account 19s', () => fetchCurrentUser.mockResolvedValue({ id: 'u2', email: OTHER_EMAIL })],
		[
			'a sign-out landed while the verify was out',
			() => vi.spyOn(authStore, 'getSignOutGeneration').mockReturnValueOnce(1),
		],
	])('still ends the other account when %s', async (_case, arrange) => {
		put.mockResolvedValue(answer('verified', true));
		fetchCurrentUser.mockResolvedValue(USER);
		arrange();
		render(page());

		expect(await screen.findByText('Sign in to continue.')).toBeTruthy();
		expect(clearPreviousAccount).toHaveBeenCalledTimes(1);
		expect(authStore.setUserForEntity).not.toHaveBeenCalled();
	});

	it('leaves the other account alone when central-manager opened no session', async () => {
		put.mockResolvedValue(answer('verified', false));
		render(page());

		expect(await screen.findByText('Sign in to continue.')).toBeTruthy();
		expect(clearPreviousAccount).not.toHaveBeenCalled();
	});

	it('ends the other account when an older central-manager 19s sign-in is another account 19s', async () => {
		localStorage.clear();
		put.mockResolvedValue(answer());
		post.mockResolvedValue({ data: { id: 'u2', email: OTHER_EMAIL } });
		render(page());

		enterPassword('correct horse');

		expect(await screen.findByText('Sign in to continue.')).toBeTruthy();
		expect(clearPreviousAccount).toHaveBeenCalledTimes(1);
	});
});
