/**
 * @vitest-environment jsdom
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
// The real client is used on purpose: the global mutation-error toast lives on its
// MutationCache, so this is what proves `skipGlobalErrorToast` is wired up.
import { queryClient } from '@/react-query/queryClient';
import { SignUp } from './SignUp';

function axiosError(status: number, data?: unknown): AxiosError {
	return { isAxiosError: true, response: { status, data } } as AxiosError;
}

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

afterEach(() => {
	vi.clearAllMocks();
	queryClient.clear();
});

describe('SignUp', () => {
	it('shows an already-registered 409 on the email field instead of a generic toast', async () => {
		post.mockRejectedValue(axiosError(409, { code: 'ConflictError', title: 'User already exists' }));

		renderSignUp();
		fillValidForm();
		submit();

		await waitFor(() => expect(screen.getByText(/An account with this email already exists/)).toBeTruthy());
		expect(toast.error).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	it('keeps the generic toast for any other failure', async () => {
		post.mockRejectedValue(axiosError(500, { error: 'boom' }));

		renderSignUp();
		fillValidForm();
		submit();

		await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
		expect(screen.queryByText(/An account with this email already exists/)).toBeNull();
	});

	it('disables the submit button while the sign-up request is in flight', async () => {
		let settle: (() => void) | undefined;
		post.mockReturnValue(
			new Promise((_resolve, reject) => {
				settle = () => reject(axiosError(409));
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
