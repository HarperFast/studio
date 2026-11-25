/**
 * @vitest-environment jsdom
 */
import type { LocalRole, LocalRolePermission, LocalUser } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, instanceParams, listRoles } = vi.hoisted(() => ({
	auth: { value: { user: null as LocalUser | null } },
	instanceParams: { instanceClient: {}, entityType: 'cluster' },
	listRoles: vi.fn(),
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
	getListRolesQueryOptions: () => ({ queryKey: ['roles'], queryFn: listRoles, retry: false }),
}));
vi.mock('@/integrations/api/instance/status/getRegistrationInfo', () => ({
	getHarperVersionProbeOptions: () => ({
		queryKey: ['registration_info'],
		queryFn: async () => ({ version: '5.4.1' }),
		retry: false,
	}),
}));
vi.mock('@/integrations/api/instance/auth/addUser', () => ({
	useAddUserMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/instance/config/roles/operations/useOperationsAllowlistSupported', () => ({
	useAllowlistVersion: () => undefined,
	useOperationsAllowlistSupported: () => undefined,
}));

import { AddUserModal } from './AddUserModal';

beforeAll(() => {
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

function signedInAs(permission: LocalRolePermission) {
	const role: LocalRole = { id: 'r', role: 'r', permission, __createdtime__: 0, __updatedtime__: 0 };
	auth.value = { user: { username: 'viewer', active: true, role, __createdtime__: 0, __updatedtime__: 0 } };
}

let client: QueryClient;

beforeEach(() => {
	listRoles.mockReset();
	listRoles.mockImplementation(async () => []);
	client = new QueryClient();
});

afterEach(cleanup);

function renderModal(isModalOpen: boolean) {
	render(
		<QueryClientProvider client={client}>
			<AddUserModal isModalOpen={isModalOpen} onChangesSaved={() => {}} setIsModalOpen={() => {}} />
		</QueryClientProvider>,
	);
}

async function versionSettled() {
	await waitFor(() => expect(['success', 'error']).toContain(client.getQueryState(['registration_info'])?.status));
}

describe('AddUserModal roles', () => {
	it('reads the roles while closed for a viewer who can list them', async () => {
		signedInAs({ super_user: true });
		renderModal(false);

		await waitFor(() => expect(listRoles).toHaveBeenCalled());
	});

	it('never reads the roles for a viewer who cannot list them, so the Users page stays up', async () => {
		signedInAs({ super_user: false, operations: ['list_users', 'add_user'] });
		renderModal(false);
		await versionSettled();

		expect(listRoles).not.toHaveBeenCalled();
	});

	it('says why no role can be chosen, and keeps Add User off', async () => {
		signedInAs({ super_user: false, operations: ['list_users', 'add_user'] });
		renderModal(true);

		await waitFor(() => expect(screen.getByText(/Choosing a role needs list_roles/)).toBeTruthy());
		expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: /Add User/ }) as HTMLButtonElement).disabled).toBe(true);
	});
});
