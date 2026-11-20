/**
 * @vitest-environment jsdom
 */
import type { SchemaOrganizationRole, SchemaUser } from '@/integrations/api/api.gen';
import { mutationErrorHandler } from '@/react-query/queryClient';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { get, post, del, toast } = vi.hoisted(() => ({
	get: vi.fn(),
	post: vi.fn(),
	del: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/config/apiClient', () => ({ apiClient: { get, post, delete: del } }));
vi.mock('@tanstack/react-router', () => ({ useParams: () => ({ organizationId: 'org-1' }) }));
vi.mock('sonner', () => ({ toast }));
// Stable identities: both land in hook dependency arrays.
const { auth, permissions } = vi.hoisted(() => ({
	auth: { user: { email: 'admin@example.com' } },
	permissions: { create: true, remove: true, update: true, view: true },
}));
vi.mock('@/hooks/useAuth', () => ({ useCloudAuth: () => auth }));
vi.mock('@/hooks/usePermissions', () => ({ useOrganizationRolePermissions: () => permissions }));

import { EditUserModal } from './EditUserModal';

// The shared error toast logs with console.error first; keep it out of the test output.
const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function httpError(status: number) {
	return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, {
		status,
		statusText: '',
		headers: {},
		config: { headers: new AxiosHeaders() },
		data: '',
	});
}

const orgRoles = [
	{ id: 'role-admin', roleName: 'admin' },
	{ id: 'role-dev', roleName: 'developer' },
] as SchemaOrganizationRole[];

function user(overrides: Partial<SchemaUser>): SchemaUser {
	return {
		id: 'usr-1',
		email: 'invitee@example.com',
		status: 'PENDING',
		roles: [orgRoles[1]],
		...overrides,
	} as SchemaUser;
}

async function renderModal(data: SchemaUser) {
	get.mockResolvedValue({ data: orgRoles });
	const onUserUpdated = vi.fn();
	// The app's own mutation cache, so a test sees the shared error toast exactly when production would.
	const client = new QueryClient({
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<EditUserModal
				closeModal={vi.fn()}
				data={data}
				isModalOpen
				onUserUpdated={onUserUpdated}
				orgUserCount={3}
				orgAdminCount={1}
			/>
		</QueryClientProvider>,
	);
	await screen.findByText('developer');
	return { onUserUpdated };
}

async function confirm(idle: RegExp, confirmation: RegExp) {
	fireEvent.click(screen.getByRole('button', { name: idle }));
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name: confirmation }));
	});
}

const cancelInvite = () => confirm(/^cancel invite$/i, /confirm cancellation/i);
const inviteDeletes = () => del.mock.calls.filter(([url]) => String(url).startsWith('/UserInvite/'));
const roleUnlinks = () => del.mock.calls.filter(([url]) => String(url).startsWith('/OrganizationRole/'));
const ownFailureToast = 'Couldn’t cancel the invitation to invitee@example.com. Please try again.';
const sharedErrorToast = (status: number) =>
	['Error', expect.objectContaining({ description: `Request failed with status code ${status}` })] as const;

describe('EditUserModal — a pending invitation', () => {
	it('cancels it through DELETE /UserInvite/{id}, not by unlinking its roles', async () => {
		del.mockResolvedValue({ data: { deleted: true } });
		const { onUserUpdated } = await renderModal(user({}));

		await cancelInvite();

		expect(del).toHaveBeenCalledTimes(1);
		expect(del).toHaveBeenCalledWith('/UserInvite/usr-1');
		expect(toast.success).toHaveBeenCalledWith('The invitation to invitee@example.com was cancelled.');
		expect(toast.error).not.toHaveBeenCalled();
		expect(onUserUpdated).toHaveBeenCalledTimes(1);
	});

	it('says so and refetches when the invitation is no longer pending (404)', async () => {
		del.mockRejectedValue(httpError(404));
		const { onUserUpdated } = await renderModal(user({}));

		await cancelInvite();

		expect(inviteDeletes()).toHaveLength(1);
		expect(roleUnlinks()).toHaveLength(0);
		expect(toast.info).toHaveBeenCalledWith(
			'The invitation to invitee@example.com is no longer pending. It was accepted or already cancelled.',
		);
		expect(toast.success).not.toHaveBeenCalled();
		expect(toast.error).not.toHaveBeenCalled();
		expect(consoleError).not.toHaveBeenCalled();
		expect(onUserUpdated).toHaveBeenCalledTimes(1);
	});

	it('falls back to unlinking only this organization’s roles when the cancellation is refused (403)', async () => {
		del.mockImplementation((url: string) =>
			url.startsWith('/UserInvite/') ? Promise.reject(httpError(403)) : Promise.resolve({ data: { deleted: true } })
		);
		const { onUserUpdated } = await renderModal(user({}));

		await cancelInvite();

		expect(inviteDeletes()).toHaveLength(1);
		expect(roleUnlinks()).toEqual([['/OrganizationRole/role/role-dev/user/usr-1']]);
		expect(toast.success).toHaveBeenCalledWith(
			'The invitation to invitee@example.com was removed from this organization.',
			expect.objectContaining({ description: expect.stringMatching(/organization you don’t manage/) }),
		);
		expect(toast.error).not.toHaveBeenCalled();
		expect(consoleError).not.toHaveBeenCalled();
		expect(onUserUpdated).toHaveBeenCalledTimes(1);
	});

	it('reports a failed fallback and still refetches', async () => {
		del.mockImplementation((url: string) => Promise.reject(httpError(url.startsWith('/UserInvite/') ? 403 : 500)));
		const { onUserUpdated } = await renderModal(user({}));

		await cancelInvite();

		expect(roleUnlinks()).toHaveLength(1);
		expect(toast.error.mock.calls).toEqual([[...sharedErrorToast(500)], [ownFailureToast]]);
		expect(toast.success).not.toHaveBeenCalled();
		expect(onUserUpdated).toHaveBeenCalledTimes(1);
	});

	it('does not fall back on any other failure', async () => {
		del.mockRejectedValue(httpError(500));
		const { onUserUpdated } = await renderModal(user({}));

		await cancelInvite();

		expect(inviteDeletes()).toHaveLength(1);
		expect(roleUnlinks()).toHaveLength(0);
		expect(toast.error.mock.calls).toEqual([[...sharedErrorToast(500)], [ownFailureToast]]);
		expect(onUserUpdated).toHaveBeenCalledTimes(1);
	});

	it('keeps its role read-only and offers no "remove from organization"', async () => {
		await renderModal(user({}));

		for (const checkbox of screen.getAllByRole('checkbox')) {
			expect(checkbox.hasAttribute('disabled')).toBe(true);
		}
		expect(screen.queryByRole('button', { name: /remove from organization/i })).toBeNull();
		expect(screen.getByText(/hasn’t been accepted yet, so its role can’t be changed/)).toBeTruthy();
	});
});

describe('EditUserModal — an active member', () => {
	it('still removes them by unlinking their roles, never through /UserInvite/', async () => {
		del.mockResolvedValue({ data: { deleted: true } });
		const { onUserUpdated } = await renderModal(user({ status: 'ACTIVE' }));

		expect(screen.queryByRole('button', { name: /^cancel invite$/i })).toBeNull();
		await confirm(/remove from organization/i, /confirm removal/i);

		expect(inviteDeletes()).toHaveLength(0);
		expect(roleUnlinks()).toEqual([['/OrganizationRole/role/role-dev/user/usr-1']]);
		expect(toast.success).toHaveBeenCalledWith('invitee@example.com was removed from the organization.');
		expect(onUserUpdated).toHaveBeenCalledTimes(1);
	});

	it('keeps its role checkboxes editable', async () => {
		await renderModal(user({ status: 'ACTIVE' }));

		expect(screen.getAllByRole('checkbox').some((checkbox) => !checkbox.hasAttribute('disabled'))).toBe(true);
	});
});
