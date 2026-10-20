/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => vi.fn(),
	useSearch: () => ({ token: 'reset-token' }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), dismiss: vi.fn() } }));
const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('./hooks/useResetPassword', () => ({ useResetPasswordMutation: () => ({ mutate, isPending: false }) }));

import { ResetPassword } from './ResetPassword';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

async function submitNewPassword(value: string) {
	await act(async () => {
		fireEvent.change(screen.getByLabelText('New Password'), { target: { value } });
		fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value } });
		fireEvent.click(screen.getByRole('button', { name: 'Submit New Password' }));
	});
}

describe('ResetPassword', () => {
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
