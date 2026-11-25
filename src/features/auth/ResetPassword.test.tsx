/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { navigate, search } = vi.hoisted(() => ({
	navigate: vi.fn(),
	search: { token: 'reset-token' } as { token: unknown; flow?: unknown },
}));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => navigate,
	useSearch: () => search,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), dismiss: vi.fn() } }));
const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('./hooks/useResetPassword', () => ({ useResetPasswordMutation: () => ({ mutate, isPending: false }) }));

import { keepSignInRedirect } from './pendingSignInRedirect';
import { ResetPassword } from './ResetPassword';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	localStorage.clear();
	search.token = 'reset-token';
	delete search.flow;
});

async function submitNewPassword(value: string) {
	await act(async () => {
		fireEvent.change(screen.getByLabelText('New Password'), { target: { value } });
		fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value } });
		fireEvent.click(screen.getByRole('button', { name: 'Submit New Password' }));
	});
}

describe('ResetPassword', () => {
	const answer = (response?: unknown) =>
		mutate.mockImplementationOnce((_request: unknown, { onSuccess }: { onSuccess: (response: unknown) => void }) =>
			onSuccess(response)
		);

	it('sends the user to sign in, with the address central-manager names filled in', async () => {
		answer({ userId: 'u1', email: 'Ada@Example.com' });
		render(<ResetPassword />);

		await submitNewPassword('a-strong-password-1');

		expect(navigate.mock.calls[0][0]).toStrictEqual({
			to: '/sign-in',
			search: undefined,
			state: { prefillEmail: 'Ada@Example.com' },
		});
	});

	// As `?redirect=` too, so Google, GitHub and Forgot password carry the target before anything is typed.
	it('marks that sign-in as finishing the link’s flow, and hands its target on', async () => {
		const mcpAuthorize = '/oauth/mcp/authorize?response_type=code&client_id=c&state=s';
		search.flow = keepSignInRedirect(mcpAuthorize);
		answer({ userId: 'u1', email: 'ada@example.com' });
		render(<ResetPassword />);

		await submitNewPassword('a-strong-password-1');

		expect(navigate).toHaveBeenCalledExactlyOnceWith({
			to: '/sign-in',
			search: { redirect: mcpAuthorize },
			state: { prefillEmail: 'ada@example.com', emailedFlow: search.flow },
		});
	});

	it.each([
		['a flow it never kept', 'Fl0w_id-0123456789abcd', { emailedFlow: 'Fl0w_id-0123456789abcd' }],
		['a flow parameter that is not one', 'not-a-flow', {}],
	])('hands on no target for %s', async (_label, flow, state) => {
		search.flow = flow;
		answer();
		render(<ResetPassword />);

		await submitNewPassword('a-strong-password-1');

		expect(navigate.mock.calls[0][0]).toStrictEqual({ to: '/sign-in', search: undefined, state });
	});

	it.each([12345, 0, true, null])('treats a search value that is not a string (%s) as no token', async (value) => {
		search.token = value;
		render(<ResetPassword />);

		await submitNewPassword('a-strong-password-1');

		expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/sign-in' });
		expect(mutate).not.toHaveBeenCalled();
	});

	// maxlength would silently clamp a pasted password, leaving the password manager holding one that never worked.
	it('lets an over-long password be typed in full and explains the limit instead', async () => {
		render(<ResetPassword />);
		const password = screen.getByLabelText('New Password') as HTMLInputElement;
		const confirmation = screen.getByLabelText('Confirm Password') as HTMLInputElement;
		expect(password.maxLength).toBe(-1);
		expect(confirmation.maxLength).toBe(-1);

		await submitNewPassword('p'.repeat(257));

		expect(password.value).toHaveLength(257);
		expect(await screen.findByText('Password cannot be longer than 256 characters.')).toBeTruthy();
		expect(mutate).not.toHaveBeenCalled();
	});

	it.each([51, 256])('accepts a %i-character password, as sign-up does', async (length) => {
		render(<ResetPassword />);
		const value = 'p'.repeat(length);

		await submitNewPassword(value);

		await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
		expect(mutate.mock.calls[0][0]).toEqual({ token: 'reset-token', password: value });
		expect(screen.queryByText(/cannot be longer than/)).toBeNull();
	});
});

describe('ResetPassword password fields', () => {
	it('never carry a length hint, however long the password runs', () => {
		render(<ResetPassword />);
		fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'p'.repeat(300) } });
		fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'p'.repeat(300) } });

		expect(document.querySelector('[data-slot="form-length-hint"]')).toBeNull();
		expect(screen.queryByText(/^Maximum/)).toBeNull();
	});
});
