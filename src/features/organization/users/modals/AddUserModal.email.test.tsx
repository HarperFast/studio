/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { addUser, inviteUser } = vi.hoisted(() => ({ addUser: vi.fn(), inviteUser: vi.fn() }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@tanstack/react-router', () => ({ useParams: () => ({ organizationId: 'org-1' }) }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/features/organization/mutations/addUserToOrganizationRole', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/features/organization/mutations/addUserToOrganizationRole')>()),
	useAddUserToOrganizationRole: () => ({ mutate: addUser, isPending: false }),
}));
vi.mock('@/features/organization/mutations/inviteUserToOrganizationRole', () => ({
	useInviteUserToOrganizationRole: () => ({ mutate: inviteUser, isPending: false }),
}));

import { AddUserModal } from './AddUserModal';

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(cleanup);

describe('AddUserModal', () => {
	// A cut address can still be a valid one, and the invite would go to it, so the email is refused rather than cut.
	it('lets an over-long email be typed in full and refuses it on submit, as a password field would', async () => {
		render(<AddUserModal isModalOpen onChangesSaved={() => {}} setIsModalOpen={() => {}} />);
		const email = screen.getByLabelText('Email') as HTMLInputElement;
		expect(email.maxLength).toBe(-1);

		await act(async () => {
			fireEvent.change(email, { target: { value: `${'u'.repeat(69)}@example.com` } });
			fireEvent.click(screen.getByRole('button', { name: /Add User/ }));
		});

		expect(email.value).toHaveLength(81);
		expect(await screen.findByText('Email cannot be longer than 80 characters.')).toBeTruthy();
		expect(document.querySelector('[data-slot="form-length-hint"]')).toBeNull();
		expect(addUser).not.toHaveBeenCalled();
		expect(inviteUser).not.toHaveBeenCalled();
	});
});
