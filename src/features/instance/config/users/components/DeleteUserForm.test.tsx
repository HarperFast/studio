/**
 * @vitest-environment jsdom
 */
import type { LocalUser } from '@/integrations/api/api.patch';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientParams: () => ({ instanceClient: {}, entityType: 'instance' }),
}));
vi.mock('@/integrations/api/instance/auth/deleteUser', () => ({
	useDeleteUserMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { DeleteUserForm } from './DeleteUserForm';

afterEach(cleanup);

function renderForm(username: string) {
	render(<DeleteUserForm data={{ username } as LocalUser} onUserDeleted={() => {}} />);
}

async function confirm(value: string) {
	await act(async () => {
		fireEvent.change(screen.getByLabelText('Confirm Username'), { target: { value } });
	});
}

async function leaveConfirmation() {
	await act(async () => {
		fireEvent.blur(screen.getByLabelText('Confirm Username'));
	});
}

function deleteButton() {
	return screen.getByRole('button', { name: /Delete User/ }) as HTMLButtonElement;
}

describe('DeleteUserForm', () => {
	it('explains a mismatch when Enter is pressed in the confirmation', async () => {
		renderForm('HDB_ADMIN');
		await confirm('someone');
		await act(async () => {
			fireEvent.keyDown(screen.getByLabelText('Confirm Username'), { key: 'Enter' });
		});

		expect(await screen.findByText('Username does not match.')).toBeTruthy();
	});

	it.each([
		['a different name', 'someone', 'Username does not match.'],
		['nothing', '', 'Please type the username again to confirm deletion.'],
	])('explains why %s does not confirm the deletion, once the field is left', async (_, typed, message) => {
		renderForm('HDB_ADMIN');
		await confirm('HDB_');
		await confirm(typed);
		expect(screen.queryByText(message)).toBeNull();

		await leaveConfirmation();

		expect(await screen.findByText(message)).toBeTruthy();
		expect(deleteButton().disabled).toBe(true);
	});
});
