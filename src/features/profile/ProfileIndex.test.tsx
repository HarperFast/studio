/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	useNavigate: () => vi.fn(),
	useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock('@/hooks/useAuth', () => ({
	useCloudAuth: () => ({ user: { id: 'user-1', firstname: 'Ada', lastname: 'Lovelace', email: 'ada@example.com' } }),
}));
vi.mock('@/features/profile/mutations/updateUserMutation', () => ({
	useUpdateUserMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/auth/handlers/logoutOnSuccess', () => ({ logoutOnSuccess: vi.fn() }));

import { ProfileIndex } from './index';

afterEach(cleanup);

async function type(label: string, value: string) {
	await act(async () => {
		fireEvent.change(screen.getByLabelText(label), { target: { value } });
	});
}

async function leave(label: string) {
	await act(async () => {
		fireEvent.blur(screen.getByLabelText(label));
	});
}

function saveButton() {
	return screen.getByRole('button', { name: /Save changes/ }) as HTMLButtonElement;
}

describe('ProfileIndex', () => {
	it('stops each name at its limit but lets a new password run long', () => {
		render(<ProfileIndex />);
		const maxLengthOf = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).maxLength;

		expect(maxLengthOf('First Name')).toBe(40);
		expect(maxLengthOf('Last Name')).toBe(80);
		expect(maxLengthOf('New Password')).toBe(-1);
		expect(maxLengthOf('Confirm New Password')).toBe(-1);
	});

	it('refuses a first name longer than central manager accepts once the field is left', async () => {
		render(<ProfileIndex />);
		await type('First Name', 'A'.repeat(41));
		await leave('First Name');

		expect(await screen.findByText('First name cannot be longer than 40 characters.')).toBeTruthy();
		expect(saveButton().disabled).toBe(true);
	});

	it('accepts a last name as long as sign-up allows', async () => {
		render(<ProfileIndex />);
		await type('Last Name', 'L'.repeat(80));
		await leave('Last Name');

		await waitFor(() => expect(saveButton().disabled).toBe(false));
	});

	it('refuses a new password longer than sign-up accepts once the field is left', async () => {
		render(<ProfileIndex />);
		await type('New Password', 'p'.repeat(257));
		await leave('New Password');

		expect(await screen.findByText('Password cannot be longer than 256 characters.')).toBeTruthy();
		expect(saveButton().disabled).toBe(true);
	});

	it('accepts a new password as long as sign-up allows', async () => {
		render(<ProfileIndex />);
		await type('New Password', 'p'.repeat(256));
		await leave('New Password');
		await type('Confirm New Password', 'p'.repeat(256));
		await leave('Confirm New Password');

		await waitFor(() => expect(saveButton().disabled).toBe(false));
		expect(screen.queryByText(/cannot be longer than/)).toBeNull();
	});

	it('explains a short new password when Enter is pressed in it', async () => {
		render(<ProfileIndex />);
		await type('New Password', 'short');
		await act(async () => {
			fireEvent.keyDown(screen.getByLabelText('New Password'), { key: 'Enter' });
		});

		expect(await screen.findByText('Password must be 8 characters or more.')).toBeTruthy();
	});

	it('explains why a short new password is refused once the field is left', async () => {
		render(<ProfileIndex />);
		await type('New Password', 'short');
		expect(screen.queryByText('Password must be 8 characters or more.')).toBeNull();

		await leave('New Password');

		expect(await screen.findByText('Password must be 8 characters or more.')).toBeTruthy();
		expect(saveButton().disabled).toBe(true);
	});

	it('asks for the confirmation once that field is left empty, not before', async () => {
		render(<ProfileIndex />);
		await type('New Password', 'long enough');
		await leave('New Password');
		expect(screen.queryByText('Please confirm your new password.')).toBeNull();
		expect(saveButton().disabled).toBe(true);

		await leave('Confirm New Password');

		expect(await screen.findByText('Please confirm your new password.')).toBeTruthy();
	});

	it('flags a mismatch typed into the confirmation once it is left', async () => {
		render(<ProfileIndex />);
		await type('New Password', 'long enough');
		await leave('New Password');
		await type('Confirm New Password', 'long enougx');
		expect(screen.queryByText('Passwords do not match')).toBeNull();

		await leave('Confirm New Password');

		expect(await screen.findByText('Passwords do not match')).toBeTruthy();
		expect(saveButton().disabled).toBe(true);
	});

	it('re-checks a visited confirmation as the new password changes', async () => {
		render(<ProfileIndex />);
		await type('New Password', 'long enough');
		await leave('New Password');
		await type('Confirm New Password', 'long enough');
		await leave('Confirm New Password');
		await waitFor(() => expect(saveButton().disabled).toBe(false));

		await type('New Password', 'long enough!');
		expect(await screen.findByText('Passwords do not match')).toBeTruthy();
		expect(saveButton().disabled).toBe(true);

		await type('New Password', 'long enough');
		await waitFor(() => expect(screen.queryByText('Passwords do not match')).toBeNull());
		expect(saveButton().disabled).toBe(false);
	});

	it('says when a name reaches its limit, but never on a password', async () => {
		render(<ProfileIndex />);
		const descriptionOf = (label: string) =>
			screen.getByLabelText(label).getAttribute('aria-describedby')!.split(' ')
				.map(id => document.getElementById(id)?.textContent).join(' ').trim();

		await type('First Name', 'A'.repeat(40));
		await type('Last Name', 'L'.repeat(80));
		await type('New Password', 'p'.repeat(300));
		await type('Confirm New Password', 'p'.repeat(300));

		expect(descriptionOf('First Name')).toBe('Maximum 40 characters reached.');
		expect(descriptionOf('Last Name')).toBe('Maximum 80 characters reached.');
		expect(descriptionOf('New Password')).not.toContain('Maximum');
		expect(descriptionOf('Confirm New Password')).not.toContain('Maximum');
		expect(document.querySelectorAll('[data-slot="form-length-hint"]')).toHaveLength(2);

		await type('Last Name', 'L'.repeat(79));
		expect(descriptionOf('Last Name')).toBe('');
	});
});
