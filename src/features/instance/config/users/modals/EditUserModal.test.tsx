/**
 * @vitest-environment jsdom
 */
import type { LocalRole, LocalRolePermission, LocalUser } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { alterUser, auth, instanceParams, roles } = vi.hoisted(() => ({
	alterUser: vi.fn(),
	auth: { value: { user: null as LocalUser | null } },
	instanceParams: { instanceClient: {}, entityType: 'cluster' },
	roles: { value: [] as LocalRole[] },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	useParams: () => ({}),
}));
vi.mock('@/hooks/useAuth', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/hooks/useAuth')>()),
	useInstanceAuth: () => auth.value,
}));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => instanceParams,
	useInstanceClientParams: () => instanceParams,
}));
vi.mock('@/integrations/api/instance/auth/getListRoles', () => ({
	getListRolesQueryOptions: () => ({ queryKey: ['roles'], queryFn: async () => roles.value }),
}));
vi.mock('@/integrations/api/instance/auth/alterUser', () => ({
	useAlterUser: () => ({ mutate: alterUser, isPending: false }),
}));
vi.mock('@/integrations/api/instance/auth/deleteUser', () => ({
	useDeleteUserMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/instance/config/roles/operations/useOperationsAllowlistSupported', () => ({
	useAllowlistVersion: () => undefined,
	useOperationsAllowlistSupported: () => undefined,
}));

import { EditUserModal } from './EditUserModal';

beforeAll(() => {
	// Radix Dialog and Select rely on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
});

function role(id: string, permission: LocalRolePermission): LocalRole {
	return { id, role: id, permission, __createdtime__: 0, __updatedtime__: 0 };
}

const superRole = role('super', { super_user: true });
const plainRole = role('plain', { super_user: false });

function user(username: string, active: boolean, userRole: LocalRole): LocalUser {
	return { username, active, role: userRole, __createdtime__: 0, __updatedtime__: 0 };
}

const viewer = user('viewer', true, superRole);
const alice = user('alice', true, plainRole);

beforeEach(() => {
	alterUser.mockReset();
	auth.value = { user: viewer };
	roles.value = [superRole, plainRole];
});

afterEach(cleanup);

function renderModal(target: LocalUser, users: LocalUser[] = [viewer, target]) {
	const client = new QueryClient();
	const modal = (data: LocalUser, list: LocalUser[]) => (
		<QueryClientProvider client={client}>
			<EditUserModal
				isModalOpen
				closeModal={() => {}}
				clusterId="cluster-1"
				data={data}
				users={list}
				onUserDeleted={() => {}}
				onUserUpdated={() => {}}
			/>
		</QueryClientProvider>
	);
	const { rerender } = render(modal(target, users));
	return { repoll: (data: LocalUser, list: LocalUser[]) => rerender(modal(data, list)) };
}

function activeSwitch() {
	return screen.queryByRole('switch', { name: 'Active' }) as HTMLButtonElement | null;
}

async function save() {
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
	});
	await waitFor(() => expect(alterUser).toHaveBeenCalledTimes(1));
	return alterUser.mock.calls[0][0] as Record<string, unknown>;
}

describe('EditUserModal active toggle', () => {
	it('deactivates a user when a super user turns the switch off', async () => {
		renderModal(alice);
		expect(activeSwitch()?.getAttribute('aria-checked')).toBe('true');

		await act(async () => {
			fireEvent.click(activeSwitch()!);
		});

		expect(await save()).toMatchObject({ username: 'alice', active: false });
	});

	it('reactivates an inactive user', async () => {
		const dormant = user('dormant', false, plainRole);
		renderModal(dormant);
		expect(activeSwitch()?.getAttribute('aria-checked')).toBe('false');

		await act(async () => {
			fireEvent.click(activeSwitch()!);
		});

		expect(await save()).toMatchObject({ username: 'dormant', active: true });
	});

	it('leaves active out of the request when the switch was not changed', async () => {
		renderModal(alice);

		expect(await save()).not.toHaveProperty('active');
	});

	it('offers the switch to a role whose operations allowlist grants alter_user', () => {
		auth.value = {
			user: user('delegate', true, role('delegate', { operations: ['list_users', 'list_roles', 'alter_user'] })),
		};
		renderModal(alice);

		expect(activeSwitch()).not.toBeNull();
	});

	it.each([
		['a role without super_user', { super_user: false }],
		['an allowlist that does not grant alter_user', { operations: ['list_users', 'list_roles'] }],
		['an allowlist without list_roles, which the modal needs to render', { operations: ['list_users', 'alter_user'] }],
	])('hides the switch from %s', async (_, permission) => {
		auth.value = { user: user('limited', true, role('limited', permission as LocalRolePermission)) };
		renderModal(alice);

		expect(activeSwitch()).toBeNull();
		expect(await save()).not.toHaveProperty('active');
	});

	it('shows the current value when the switch appears after a re-poll', () => {
		auth.value = { user: null };
		const { repoll } = renderModal(alice);
		const deactivatedElsewhere = { ...alice, active: false };
		repoll(deactivatedElsewhere, [viewer, deactivatedElsewhere]);

		auth.value = { user: viewer };
		repoll(deactivatedElsewhere, [viewer, deactivatedElsewhere]);

		expect(activeSwitch()?.getAttribute('aria-checked')).toBe('false');
	});

	it('hides the switch while the signed-in user is unknown', () => {
		auth.value = { user: null };
		renderModal(alice);

		expect(activeSwitch()).toBeNull();
	});

	it('hides the switch on your own account', () => {
		renderModal(viewer, [viewer, user('backup', true, superRole)]);

		expect(activeSwitch()).toBeNull();
	});

	it('locks the switch on for the only active super user', async () => {
		const delegate = user(
			'delegate',
			true,
			role('delegate', { operations: ['list_users', 'list_roles', 'alter_user'] }),
		);
		const admin = user('admin', true, superRole);
		auth.value = { user: delegate };
		renderModal(admin, [delegate, admin, user('dormant', false, superRole)]);

		expect(activeSwitch()?.disabled).toBe(true);
		expect(screen.getByText(/only active super user/)).toBeTruthy();
		expect(await save()).not.toHaveProperty('active');
	});

	it('does not undo a change another admin made while the form was open', async () => {
		const { repoll } = renderModal(alice);
		const deactivatedElsewhere = { ...alice, active: false };
		repoll(deactivatedElsewhere, [viewer, deactivatedElsewhere]);

		expect(activeSwitch()?.getAttribute('aria-checked')).toBe('false');
		expect(await save()).not.toHaveProperty('active');
	});

	it("keeps the editor's choice when the list re-polls after they touched the switch", async () => {
		const { repoll } = renderModal(alice);
		await act(async () => {
			fireEvent.click(activeSwitch()!);
		});
		const deactivatedElsewhere = { ...alice, active: false };
		repoll(deactivatedElsewhere, [viewer, deactivatedElsewhere]);
		repoll(alice, [viewer, alice]);

		expect(activeSwitch()?.getAttribute('aria-checked')).toBe('false');
		expect(await save()).toMatchObject({ username: 'alice', active: false });
	});

	it('does not send a deactivation once the switch has become locked', async () => {
		const delegate = user(
			'delegate',
			true,
			role('delegate', { operations: ['list_users', 'list_roles', 'alter_user'] }),
		);
		const admin = user('admin', true, superRole);
		const backup = user('backup', true, superRole);
		auth.value = { user: delegate };
		const { repoll } = renderModal(admin, [delegate, admin, backup]);
		await act(async () => {
			fireEvent.click(activeSwitch()!);
		});

		repoll(admin, [delegate, admin, { ...backup, active: false }]);

		expect(activeSwitch()?.disabled).toBe(true);
		expect(activeSwitch()?.getAttribute('aria-checked')).toBe('true');
		expect(await save()).not.toHaveProperty('active');
	});

	it('lets a super user be deactivated while another active one remains', () => {
		const admin = user('admin', true, superRole);
		renderModal(admin, [viewer, admin]);

		expect(activeSwitch()?.disabled).toBe(false);
	});
});

describe('EditUserModal delete section', () => {
	function deleteTrigger() {
		return screen.queryByRole('button', { name: 'Delete this user' });
	}

	it('starts collapsed, and opens to the confirmation form', async () => {
		renderModal(alice);
		expect(deleteTrigger()?.getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByLabelText('Confirm Username')).toBeNull();

		await act(async () => {
			fireEvent.click(deleteTrigger()!);
		});

		expect(deleteTrigger()?.getAttribute('aria-expanded')).toBe('true');
		expect(screen.getByLabelText('Confirm Username')).toBeTruthy();
		expect(screen.getByText(/turn off Active instead/)).toBeTruthy();
	});

	it('does not point at the Active switch when the switch is not offered', async () => {
		auth.value = { user: user('delegate', true, role('delegate', { operations: ['list_users', 'drop_user'] })) };
		renderModal(alice);

		await act(async () => {
			fireEvent.click(deleteTrigger()!);
		});

		expect(screen.getByText(/permanently deletes alice's account/)).toBeTruthy();
		expect(screen.queryByText(/turn off Active/)).toBeNull();
	});

	it('does not suggest turning off Active for a user who is already inactive', async () => {
		renderModal(user('dormant', false, plainRole));

		await act(async () => {
			fireEvent.click(deleteTrigger()!);
		});

		expect(screen.getByText(/permanently deletes dormant's account/)).toBeTruthy();
		expect(screen.queryByText(/turn off Active/)).toBeNull();
	});

	it('is not offered on your own account', () => {
		renderModal(viewer, [viewer, user('backup', true, superRole)]);

		expect(deleteTrigger()).toBeNull();
	});
});
