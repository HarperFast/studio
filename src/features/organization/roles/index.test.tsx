/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { navigate, permissions } = vi.hoisted(() => ({
	navigate: vi.fn(),
	permissions: { value: { create: true } },
}));

vi.mock('sonner', () => ({ toast: { loading: vi.fn(), success: vi.fn() } }));
vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ organizationId: 'org-1' }),
	useNavigate: () => navigate,
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
	useSuspenseQuery: () => ({
		data: [
			{ id: 'role-admin', roleName: 'admin', userIds: ['u1', 'u2'] },
			{ id: 'role-ci', roleName: 'deployers', userIds: [] },
		],
		refetch: vi.fn(),
		isFetching: false,
		isRefetching: false,
	}),
}));
vi.mock('@/hooks/usePermissions', () => ({ useOrganizationRolePermissions: () => permissions.value }));
vi.mock('@/components/SubNavMenu', () => ({ SubNavMenu: () => null }));
vi.mock('@/features/organization/components/OrgPageLayout', () => ({
	OrgPageLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('./modals/AddOrganizationRoleModal', () => ({ AddOrganizationRoleModal: () => null }));
vi.mock('./modals/EditOrganizationRoleModal', () => ({ EditOrganizationRoleModal: () => null }));

import { OrgConfigRolesIndex } from './index';

beforeEach(() => {
	navigate.mockReset();
	permissions.value = { create: true };
});

afterEach(cleanup);

describe('OrgConfigRolesIndex', () => {
	it('lists each role in the shared table, with its id and how many users have it', () => {
		render(<OrgConfigRolesIndex />);
		expect(screen.getByRole('heading', { name: 'Roles' })).toBeTruthy();
		const [, admin, deployers] = screen.getAllByRole('row');
		expect(within(admin).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['admin', 'role-admin', '2']);
		expect(within(deployers).getAllByRole('cell')[2].textContent).toBe('No users assigned');
	});

	it('opens a role from its row', async () => {
		render(<OrgConfigRolesIndex />);
		await act(async () => {
			fireEvent.click(screen.getByText('deployers'));
		});
		expect(navigate).toHaveBeenCalledWith({ to: 'role-ci' });
	});

	it('offers to add a role only to someone who can create roles', () => {
		render(<OrgConfigRolesIndex />);
		expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
		cleanup();
		permissions.value = { create: false };
		render(<OrgConfigRolesIndex />);
		expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
	});
});
