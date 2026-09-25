/**
 * @vitest-environment jsdom
 */
import type { SchemaOrganizationRole } from '@/integrations/api/api.gen';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const roleInfo = {
	organization: {
		update: false,
		delete: false,
		roles: { create: true, view: true, update: true, delete: true },
		clusters: { create: true, view: true, update: true, delete: true, resources: [] },
	},
};

// Monaco can't load in jsdom; the permissions JSON isn't what these tests exercise.
vi.mock('@/lib/monaco/MonacoEditor', () => ({ Editor: () => null }));
vi.mock('@/hooks/useMonacoTheme', () => ({ useMonacoTheme: () => 'light' }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() } }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
	useSuspenseQuery: () => ({ data: roleInfo }),
}));
vi.mock('@/features/organization/queries/getOrganizationRoleInfo', () => ({
	getOrganizationRoleInfoQueryOptions: () => ({}),
}));
vi.mock('@/hooks/useAuth', () => ({ useCloudAuth: () => ({ user: { roles: {} } }) }));
vi.mock('@/hooks/usePermissions', () => ({
	useOrganizationRolePermissions: () => ({ update: true, remove: true }),
}));
vi.mock('@/features/organization/mutations/updateOrganizationRole', () => ({
	useUpdateOrganizationRole: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/organization/mutations/deleteOrganizationRole', () => ({
	useDeleteOrganizationRole: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { EditOrganizationRoleModal } from './EditOrganizationRoleModal';

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(cleanup);

describe('EditOrganizationRoleModal', () => {
	it("saves a role whose name the add form would refuse, since the name can't be edited here", async () => {
		const role = { id: 'role-1', organizationId: 'org-1', roleName: 'fab user' } as SchemaOrganizationRole;
		render(<EditOrganizationRoleModal data={role} isModalOpen closeModal={() => {}} />);

		await act(async () => {
			fireEvent.click(screen.getByLabelText('Can Update Organization'));
		});

		await waitFor(() =>
			expect((screen.getByRole('button', { name: 'Save Changes' }) as HTMLButtonElement).disabled).toBe(false)
		);
	});
});
