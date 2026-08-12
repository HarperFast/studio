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

import { toast } from 'sonner';
// The app's own mutation-error routing, not a copy of it: whether the form's failure also
// reaches the global toast is part of what's under test, so restating that rule here would let
// these tests pass even if `skipGlobalErrorToast` stopped being honored.
import { mutationErrorHandler } from '@/react-query/queryClient';
import { SignUp } from './SignUp';

function axiosError(status: number, data?: unknown): AxiosError {
	return { isAxiosError: true, response: { status, data } } as AxiosError;
}

// Fresh per test, so nothing leaks between them.
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
});

afterEach(() => vi.clearAllMocks());

describe('SignUp', () => {
	it("reports the server's reason in the form rather than a toast", async () => {
		post.mockRejectedValue(axiosError(500, { code: 'InternalError', title: 'Signup is unavailable' }));

		renderSignUp();
		fillValidForm();
		submit();

		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Signup is unavailable'));
		expect(toast.error).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	// Whatever central-manager rejects with has to reach the user — the form maps no status
	// codes of its own, so this must hold for a shape it has never seen.
	it.each([
		[400, { error: 'Password is too short' }, 'Password is too short'],
		[409, 'User already exists', 'User already exists'],
		// A legacy "Code: sentence" body: the toast splits the first clause into its heading, and
		// the inline line has no heading — it must still read as a whole sentence.
		[409, 'Conflict: user already exists', 'Conflict: user already exists'],
		[503, undefined, 'We had some trouble!'],
	])('surfaces a %i rejection inline', async (status, data, expected) => {
		post.mockRejectedValue(axiosError(status, data));

		renderSignUp();
		fillValidForm();
		submit();

		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(expected));
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
