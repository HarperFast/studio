/**
 * @vitest-environment jsdom
 */
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post } }));

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => navigate,
	useSearch: () => ({}),
	Link: ({ children, ...rest }: PropsWithChildren<{ className?: string }>) => <a {...rest}>{children}</a>,
}));

vi.mock('sonner', () => ({
	toast: { error: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('@/integrations/reo/reo', () => ({ reoClient: { identify: vi.fn() } }));

// Stands in for Google's script: the hook mints through this module at submit time.
const { captchaState } = vi.hoisted(() => ({
	captchaState: { configured: true, token: undefined as string | undefined, mints: [] as string[] },
}));
vi.mock('@/lib/recaptcha/recaptchaScript', () => ({
	isCaptchaConfigured: () => captchaState.configured,
	warmCaptcha: vi.fn(),
	getCaptchaToken: async (action: string) => {
		captchaState.mints.push(action);
		return captchaState.token;
	},
}));

import { toast } from 'sonner';
// The app's own mutation-error routing, not a copy of it: whether the form's failure also
// reaches the global toast is part of what's under test, so restating that rule here would let
// these tests pass even if `skipGlobalErrorToast` stopped being honored.
import { mutationErrorHandler } from '@/react-query/queryClient';
import {
	OUTCOME_UNKNOWN_MESSAGE,
	SERVER_ERROR_MESSAGE,
	SERVER_UNAVAILABLE_MESSAGE,
	TOO_MANY_ATTEMPTS_MESSAGE,
} from './describeAuthFailure';
import { SignUp } from './SignUp';

function axiosError(status: number, data?: unknown): AxiosError {
	return { isAxiosError: true, response: { status, data } } as AxiosError;
}

// Fresh per test, so nothing leaks between them.
const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

let queryClient: QueryClient;

function renderSignUp() {
	return render(
		<QueryClientProvider client={queryClient}>
			<SignUp />
		</QueryClientProvider>,
	);
}

function fillValidForm() {
	fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Ada' } });
	fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Lovelace' } });
	fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'taken@example.com' } });
	fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse battery' } });
	fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'correct horse battery' } });
	// `termsCheckbox` is rendered twice (above the OAuth buttons and inside the form); either
	// one drives the same field.
	fireEvent.click(screen.getAllByRole('checkbox')[0]);
}

function submit() {
	fireEvent.click(screen.getByRole('button', { name: 'Sign Up For Free' }));
}

beforeEach(() => {
	queryClient = new QueryClient({
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
		defaultOptions: { mutations: { retry: false } },
	});
	captchaState.configured = true;
	captchaState.token = undefined;
	captchaState.mints = [];
});

afterEach(() => vi.clearAllMocks());

describe('SignUp', () => {
	it("reports the server's reason in the form rather than a toast", async () => {
		post.mockRejectedValue(axiosError(422, { code: 'InvalidEmail', title: 'That address is not accepted' }));

		renderSignUp();
		fillValidForm();
		submit();

		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('That address is not accepted'));
		expect(toast.error).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	// A 4xx body renders verbatim, and an edge/WAF block page arrives as one long string. The cut is
	// a UTF-16 slice, so it can land inside a surrogate pair — `truncate` strips the orphan.
	it.each([
		['ascii', 'x'.repeat(4000)],
		// The leading odd-length run puts the 240th UTF-16 unit inside a surrogate pair; without it
		// the cut lands cleanly between emoji and the test passes against a naive slice.
		['astral characters', `${'x'.repeat(11)}${'😀'.repeat(4000)}`],
	])('truncates a 4xx body of %s without corrupting it', async (_label, body) => {
		post.mockRejectedValue(axiosError(403, body));

		renderSignUp();
		fillValidForm();
		submit();

		const alert = await waitFor(() => screen.getByRole('alert'));
		expect(Array.from(alert.textContent!).length).toBeLessThan(300);
		expect(alert.textContent).toContain('…');
		// A split pair stays a lone surrogate in `textContent` — it only becomes U+FFFD at encoding
		// time — so match one directly. (`String#isWellFormed` would say this too, but it needs the
		// es2024 lib this repo does not target.)
		expect(alert.textContent).not.toMatch(UNPAIRED_SURROGATE);
	});

	// Sign-up's recovery has to be sign-up's: pointing a would-be account holder at a password-reset
	// inbox is the mis-advice this whole classification exists to prevent (#1668).
	it('gives sign-up’s own recovery when the outcome is unknown', async () => {
		post.mockRejectedValue(axiosError(504));

		renderSignUp();
		fillValidForm();
		submit();

		const alert = await waitFor(() => screen.getByRole('alert'));
		expect(alert.textContent).toContain(OUTCOME_UNKNOWN_MESSAGE);
		expect(alert.textContent).toContain('Check your email for a verification link before signing up again.');
		expect(alert.textContent).not.toContain('requesting another link');
	});

	it('offers support for a 500, which retrying may not clear', async () => {
		post.mockRejectedValue(axiosError(500));

		renderSignUp();
		fillValidForm();
		submit();

		const alert = await waitFor(() => screen.getByRole('alert'));
		expect(alert.textContent).toContain(SERVER_ERROR_MESSAGE);
		expect(alert.textContent).toContain('if this keeps happening');
	});

	// The alert persists on an anonymous page, so a 5xx body never reaches it (#1676).
	it('never renders a 5xx body, however sentence-shaped', async () => {
		post.mockRejectedValue(axiosError(500, { error: 'connect ECONNREFUSED 10.0.3.14:9925' }));

		renderSignUp();
		fillValidForm();
		submit();

		const alert = await waitFor(() => screen.getByRole('alert'));
		expect(alert.textContent).toContain(SERVER_ERROR_MESSAGE);
		expect(alert.textContent).not.toContain('10.0.3.14');
	});

	// Whatever central-manager rejects with has to reach the user — the form maps no status
	// codes of its own, so this must hold for a shape it has never seen.
	it.each([
		[400, { error: 'Password is too short' }, 'Password is too short'],
		[409, 'User already exists', 'User already exists'],
		// A legacy "Code: sentence" body: the toast splits the first clause into its heading, and
		// the inline line has no heading — it must still read as a whole sentence.
		[409, 'Conflict: user already exists', 'Conflict: user already exists'],
		[503, undefined, SERVER_UNAVAILABLE_MESSAGE],
		[429, undefined, TOO_MANY_ATTEMPTS_MESSAGE],
	])('surfaces a %i rejection inline', async (status, data, expected) => {
		post.mockRejectedValue(axiosError(status, data));

		renderSignUp();
		fillValidForm();
		submit();

		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(expected));
	});

	it('still reports an inline failure to telemetry', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		post.mockRejectedValue(axiosError(503));

		renderSignUp();
		fillValidForm();
		submit();

		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
		expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ isAxiosError: true }));
		consoleError.mockRestore();
	});

	// Documents a real defect (#1677), not desired behavior: the server failure outlives a resubmit
	// the resolver rejected, so it sits next to a contradicting field error. `post` is asserted at
	// one call to prove the second submit really was rejected client-side rather than re-failing.
	// Adding `onInvalid: () => clearErrors('root')` does not change this; sign-in is unaffected
	// because its failure lives outside react-hook-form.
	it('leaves a stale server failure up after an invalid resubmit (#1677)', async () => {
		post.mockRejectedValue(axiosError(409, 'User already exists'));

		renderSignUp();
		fillValidForm();
		submit();
		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('User already exists'));

		fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
		submit();

		await waitFor(() => expect(screen.getByText('Please enter a valid email address.')).toBeTruthy());
		expect(post).toHaveBeenCalledTimes(1);
		expect(screen.getByRole('alert').textContent).toContain('User already exists');
	});

	it('clears the previous failure when the form is resubmitted', async () => {
		post.mockRejectedValueOnce(axiosError(503));

		renderSignUp();
		fillValidForm();
		submit();
		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

		post.mockResolvedValueOnce({ data: { id: 'usr-1', email: 'taken@example.com' } });
		submit();

		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('disables the submit button while the sign-up request is in flight', async () => {
		let settle: (() => void) | undefined;
		post.mockReturnValue(
			new Promise((_resolve, reject) => {
				settle = () => reject(axiosError(503));
			}),
		);

		renderSignUp();
		fillValidForm();
		submit();

		const button = screen.getByRole('button', { name: 'Sign Up For Free' });
		await waitFor(() => expect(button.hasAttribute('disabled')).toBe(true));

		settle!();
		await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
	});
});

describe('SignUp — reCAPTCHA', () => {
	it('mints a signup token at submit and sends it as captchaToken', async () => {
		captchaState.token = 'human-token';
		post.mockResolvedValue({ data: { id: 'usr-1', email: 'taken@example.com' } });

		renderSignUp();
		fillValidForm();
		submit();

		await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
		expect(captchaState.mints).toEqual(['signup']);
		expect(post.mock.calls[0][1]).toMatchObject({ captchaToken: 'human-token' });
	});

	it('omits the field entirely when no token could be minted (enforcement still off)', async () => {
		captchaState.configured = false;
		post.mockResolvedValue({ data: { id: 'usr-1', email: 'taken@example.com' } });

		renderSignUp();
		fillValidForm();
		submit();

		await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
		// toHaveBeenCalledWith treats an explicit undefined as absent, so assert the key
		// is genuinely gone — the rollout depends on an untokened body being clean.
		expect(post.mock.calls[0][1]).not.toHaveProperty('captchaToken');
	});

	it('reports a rejected token with wording that says what to do next', async () => {
		captchaState.token = 'rejected-token';
		post.mockRejectedValue(axiosError(403, 'Verification failed'));

		renderSignUp();
		fillValidForm();
		submit();

		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toContain('Verification failed. Please try again.')
		);
		expect(navigate).not.toHaveBeenCalled();
	});

	it('offers a human after a second consecutive failure, not a third "try again"', async () => {
		// A low score can't be retried away, so the dead end needs an exit.
		captchaState.token = 'rejected-token';
		post.mockRejectedValue(axiosError(403, 'Verification failed'));

		renderSignUp();
		fillValidForm();
		submit();
		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
		expect(screen.queryByRole('link', { name: 'Contact us' })).toBeNull();

		submit();
		await waitFor(() => expect(screen.getByRole('link', { name: 'Contact us' })).toBeTruthy());
		expect(screen.getByRole('link', { name: 'Contact us' }).getAttribute('href')).toContain('mailto:');
		// Pins the space a formatter can silently eat, producing "again.Contact us".
		expect(screen.getByRole('alert').textContent).toContain('again. Contact us if this keeps happening.');
	});

	it('drops the support offer once a failure is not the CAPTCHA', async () => {
		captchaState.token = 'rejected-token';
		post.mockRejectedValue(axiosError(403, 'Verification failed'));

		renderSignUp();
		fillValidForm();
		submit();
		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
		submit();
		await waitFor(() => expect(screen.getByRole('link', { name: 'Contact us' })).toBeTruthy());

		post.mockRejectedValue(axiosError(409, 'User already exists'));
		submit();
		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('User already exists'));
		expect(screen.queryByRole('link', { name: 'Contact us' })).toBeNull();
	});

	it('names the real problem when the check never ran (script blocked, key configured)', async () => {
		captchaState.token = undefined; // configured, but the mint failed
		post.mockRejectedValue(axiosError(403, 'Verification failed'));

		renderSignUp();
		fillValidForm();
		submit();

		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toContain('could not run the verification check')
		);
	});

	it('a retry after any failure mints a fresh token by design', async () => {
		captchaState.token = 'first-token';
		post.mockRejectedValueOnce(axiosError(409, 'User already exists'));

		renderSignUp();
		fillValidForm();
		submit();
		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('User already exists'));

		captchaState.token = 'second-token';
		post.mockResolvedValueOnce({ data: { id: 'usr-1', email: 'taken@example.com' } });
		submit();

		await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
		expect(captchaState.mints).toEqual(['signup', 'signup']);
		expect(post.mock.calls[1][1]).toMatchObject({ captchaToken: 'second-token' });
	});
});
