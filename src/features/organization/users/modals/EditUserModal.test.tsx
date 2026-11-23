/**
 * @vitest-environment jsdom
 */
import { ResendInviteButton } from '@/features/organization/users/components/ResendInviteButton';
import type { SchemaOrganizationRole, SchemaUser } from '@/integrations/api/api.gen';
import { mutationErrorHandler } from '@/react-query/queryClient';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
	{ id: 'role-admin', roleName: 'admin', userIds: [] },
	{ id: 'role-dev', roleName: 'developer', userIds: [] },
] as unknown as SchemaOrganizationRole[];

function user(overrides: Partial<SchemaUser>): SchemaUser {
	return {
		id: 'usr-1',
		email: 'invitee@example.com',
		status: 'PENDING',
		roles: [orgRoles[1]],
		...overrides,
	} as SchemaUser;
}

function membersWith(status: SchemaUser['status'] | null) {
	return orgRoles.map((role) =>
		role.id === 'role-dev' && status
			? { ...role, userIds: ['usr-1'], users: [{ id: 'usr-1', email: 'invitee@example.com', status }] }
			: role
	);
}

function listedIds(client: QueryClient) {
	return (client.getQueryData<SchemaOrganizationRole[]>(['org-1', 'roles']) ?? []).flatMap((role) => [
		...role.userIds,
		...(role.users ?? []).map((member) => member.id),
	]);
}

function deferred<T>() {
	let resolve: (value: T) => void = () => undefined;
	const promise = new Promise<T>((settle) => (resolve = settle));
	return { promise, resolve };
}

async function renderModal(data: SchemaUser) {
	get.mockResolvedValue({ data: membersWith(data.status ?? null) });
	const onUserUpdated = vi.fn();
	const closeModal = vi.fn();
	// The app's own mutation cache, so a test sees the shared error toast exactly when production would.
	const client = new QueryClient({
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	// The users table's row action for the same user, beside the dialog as on the page.
	const page = (withDialog: boolean) => (
		<QueryClientProvider client={client}>
			<div data-testid="row">
				<ResendInviteButton user={data} />
			</div>
			{withDialog && (
				<EditUserModal
					closeModal={closeModal}
					data={data}
					isModalOpen
					onUserUpdated={onUserUpdated}
					orgUserCount={3}
					orgAdminCount={1}
				/>
			)}
		</QueryClientProvider>
	);
	const { rerender } = render(page(true));
	await screen.findByText('developer');
	return { onUserUpdated, closeModal, client, closeDialog: () => rerender(page(false)) };
}

const rowResend = () => within(screen.getByTestId('row')).getByRole('button', { name: /resend invite/i, hidden: true });

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
		const { onUserUpdated, client } = await renderModal(user({}));
		// Still listed when the dialog closes: dropping it first would unmount the dialog under its URL.
		onUserUpdated.mockImplementation(() => expect(listedIds(client)).toContain('usr-1'));

		await cancelInvite();

		expect(del).toHaveBeenCalledTimes(1);
		expect(del).toHaveBeenCalledWith('/UserInvite/usr-1');
		expect(toast.success).toHaveBeenCalledWith('The invitation to invitee@example.com was cancelled.');
		expect(toast.error).not.toHaveBeenCalled();
		expect(onUserUpdated).toHaveBeenCalledTimes(1);
		expect(onUserUpdated).toHaveReturned();
		// Gone from the list before the refetch lands, so the table row can't offer Resend meanwhile.
		expect(listedIds(client)).not.toContain('usr-1');
	});

	it('holds Cancel invite back while a resend for the same user is in flight', async () => {
		let settle: (value: unknown) => void = () => undefined;
		post.mockReturnValue(new Promise((resolve) => (settle = resolve)));
		await renderModal(user({}));
		const cancel = screen.getByRole('button', { name: /^cancel invite$/i });
		expect(cancel.hasAttribute('disabled')).toBe(false);

		await act(async () => {
			fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /resend invite/i }));
		});
		expect(post).toHaveBeenCalledWith('/UserInvite/', { email: 'invitee@example.com', roleId: 'role-dev' });
		// useIsMutating hears of it through React Query's batched notify, a timer later.
		await waitFor(() => expect(cancel.hasAttribute('disabled')).toBe(true));
		// Not busy: nothing is being cancelled yet.
		expect(cancel.textContent).toMatch(/^\s*cancel invite$/i);

		await act(async () => settle({ data: {} }));
		await waitFor(() => expect(cancel.hasAttribute('disabled')).toBe(false));
	});

	it('keeps Resend disabled from the moment a cancellation starts', async () => {
		let settle: (value: unknown) => void = () => undefined;
		del.mockReturnValue(new Promise((resolve) => (settle = resolve)));
		await renderModal(user({}));
		const resend = within(screen.getByRole('dialog')).getByRole('button', { name: /resend invite/i });
		expect(resend.hasAttribute('disabled')).toBe(false);

		await cancelInvite();
		expect(resend.hasAttribute('disabled')).toBe(true);

		await act(async () => settle({ data: { deleted: true } }));
		expect(toast.success).toHaveBeenCalledWith('The invitation to invitee@example.com was cancelled.');
		expect(resend.hasAttribute('disabled')).toBe(true);
		fireEvent.click(resend);
		expect(post).not.toHaveBeenCalled();
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
		const { onUserUpdated, client } = await renderModal(user({}));

		await cancelInvite();

		expect(inviteDeletes()).toHaveLength(1);
		expect(get).toHaveBeenCalledTimes(2);
		expect(roleUnlinks()).toEqual([['/OrganizationRole/role/role-dev/user/usr-1']]);
		expect(toast.success).toHaveBeenCalledWith(
			'The invitation to invitee@example.com was removed from this organization.',
			expect.objectContaining({ description: expect.stringMatching(/organization you don’t manage/) }),
		);
		expect(toast.error).not.toHaveBeenCalled();
		expect(consoleError).not.toHaveBeenCalled();
		expect(listedIds(client)).not.toContain('usr-1');
		expect(onUserUpdated).toHaveBeenCalledTimes(1);
	});

	it.each([
		['accepted it in the meantime', 'ACTIVE' as const],
		['has left this organization', null],
	])('unlinks nothing on a 403 when a fresh read shows the user %s', async (_case, status) => {
		del.mockRejectedValue(httpError(403));
		const { onUserUpdated, client } = await renderModal(user({}));
		get.mockResolvedValue({ data: membersWith(status) });

		await cancelInvite();

		expect(get).toHaveBeenLastCalledWith('/OrganizationRole/org-1');
		expect(roleUnlinks()).toHaveLength(0);
		expect(toast.info).toHaveBeenCalledWith(
			'The invitation to invitee@example.com is no longer pending. It was accepted or already cancelled.',
		);
		expect(toast.success).not.toHaveBeenCalled();
		expect(toast.error).not.toHaveBeenCalled();
		expect(client.getQueryData<SchemaOrganizationRole[]>(['org-1', 'roles'])).toEqual(membersWith(status));
		expect(onUserUpdated).toHaveBeenCalledTimes(1);
	});

	it('does not let the 403 re-read join a member-list poll sent before it', async () => {
		del.mockRejectedValue(httpError(403));
		const { client } = await renderModal(user({}));
		// A poll already on its way, which read the user before they accepted.
		const poll = deferred<{ data: SchemaOrganizationRole[] }>();
		get.mockReturnValueOnce(poll.promise);
		void client.refetchQueries({ queryKey: ['org-1', 'roles'] });
		await waitFor(() => expect(client.getQueryState(['org-1', 'roles'])?.fetchStatus).toBe('fetching'));
		get.mockResolvedValue({ data: membersWith('ACTIVE') });

		await cancelInvite();
		await act(async () => poll.resolve({ data: membersWith('PENDING') }));

		await waitFor(() => expect(toast.info).toHaveBeenCalled());
		expect(roleUnlinks()).toHaveLength(0);
		expect(toast.success).not.toHaveBeenCalled();
	});

	it('cannot be dismissed while the cancellation is in flight', async () => {
		const response = deferred<unknown>();
		del.mockReturnValue(response.promise);
		const { closeModal } = await renderModal(user({}));
		// Positive control: Escape does reach closeModal while nothing is running.
		fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
		expect(closeModal).toHaveBeenCalledTimes(1);

		await cancelInvite();
		fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
		expect(closeModal).toHaveBeenCalledTimes(1);

		await act(async () => response.resolve({ data: { deleted: true } }));
	});

	it('holds the row’s Resend back until the cancellation has a verdict, even if the dialog is gone', async () => {
		const response = deferred<unknown>();
		del.mockReturnValue(response.promise);
		const { closeDialog } = await renderModal(user({}));
		expect(rowResend().hasAttribute('disabled')).toBe(false);

		await cancelInvite();
		closeDialog();
		await waitFor(() => expect(rowResend().hasAttribute('disabled')).toBe(true));
		fireEvent.click(rowResend());
		expect(post).not.toHaveBeenCalled();

		await act(async () => response.resolve({ data: { deleted: true } }));
		await waitFor(() => expect(rowResend().hasAttribute('disabled')).toBe(false));
	});

	it('unlinks nothing when the fresh read itself fails', async () => {
		del.mockRejectedValue(httpError(403));
		const { onUserUpdated } = await renderModal(user({}));
		get.mockRejectedValue(httpError(500));

		await cancelInvite();

		expect(roleUnlinks()).toHaveLength(0);
		expect(toast.error).toHaveBeenCalledWith(ownFailureToast);
		expect(toast.success).not.toHaveBeenCalled();
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
