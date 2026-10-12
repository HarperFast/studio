/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@tanstack/react-router', () => ({ useParams: () => ({ organizationId: 'org-1' }) }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/features/organization/mutations/addUserToOrganizationRole', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/features/organization/mutations/addUserToOrganizationRole')>()),
	useAddUserToOrganizationRole: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/organization/mutations/inviteUserToOrganizationRole', () => ({
	useInviteUserToOrganizationRole: () => ({ mutate: vi.fn(), isPending: false }),
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
	it('stops the email at the 80 characters the form accepts, and says so there', () => {
		render(<AddUserModal isModalOpen onChangesSaved={() => {}} setIsModalOpen={() => {}} />);
		const email = screen.getByLabelText('Email') as HTMLInputElement;
		expect(email.maxLength).toBe(80);

		fireEvent.change(email, { target: { value: 'a'.repeat(80) } });
		expect(screen.getByText('Maximum 80 characters reached.')).toBeTruthy();
	});
});
