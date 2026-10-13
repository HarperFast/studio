/**
 * @vitest-environment jsdom
 */
import type { SchemaOrganizationRole } from '@/integrations/api/api.gen';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectStub } from '../../serviceAccounts/__tests__/selectStub';

const { update, remove, permissions, auth, roleInfo } = vi.hoisted(() => ({
	update: vi.fn(),
	remove: vi.fn(),
	permissions: { value: { update: true, remove: true } },
	auth: { value: { user: { roles: {} as Record<string, { id: string }> } } },
	roleInfo: { value: {} as Record<string, unknown> },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() } }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
	useSuspenseQuery: () => ({ data: roleInfo.value }),
	useQuery: () => ({
		data: {
			clusters: [
				{ id: 'clu-a', name: 'alpha', status: 'RUNNING' },
				{ id: 'clu-b', name: 'beta', status: 'RUNNING' },
				{ id: 'clu-c', name: 'gamma', status: 'TERMINATED' },
			],
		},
	}),
}));
vi.mock('@/features/organization/queries/getOrganizationRoleInfo', () => ({
	getOrganizationRoleInfoQueryOptions: () => ({}),
}));
vi.mock('@/hooks/useAuth', () => ({ useCloudAuth: () => auth.value }));
vi.mock('@/hooks/usePermissions', () => ({ useOrganizationRolePermissions: () => permissions.value }));
vi.mock('@/features/organization/mutations/updateOrganizationRole', () => ({
	useUpdateOrganizationRole: () => ({ mutate: update, isPending: false }),
}));
vi.mock('@/features/organization/mutations/deleteOrganizationRole', () => ({
	useDeleteOrganizationRole: () => ({ mutate: remove, isPending: false }),
}));
vi.mock('@/components/ui/select', () => selectStub);
vi.mock('@/hooks/useMonacoTheme', () => ({ useMonacoTheme: () => 'light' }));
vi.mock('@/lib/monaco/MonacoEditor', () => ({
	Editor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
		<textarea
			aria-label="Permissions JSON"
			value={value}
			onChange={(event) => onChange(event.target.value)}
		/>
	),
}));

import { EditOrganizationRoleModal } from './EditOrganizationRoleModal';

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

const roles = { create: false, view: true, update: false, delete: false };
const override = {
	id: 'clu-b',
	view: true,
	update: true,
	delete: false,
	instances: { create: false, view: true, update: true, delete: false },
};
const customClusters = { create: false, view: true, update: true, delete: false, resources: [override] };

beforeEach(() => {
	update.mockReset();
	remove.mockReset();
	permissions.value = { update: true, remove: true };
	auth.value = { user: { roles: {} } };
	roleInfo.value = { organization: { update: false, delete: false, roles, clusters: customClusters } };
});

afterEach(cleanup);

const role = (overrides: Partial<SchemaOrganizationRole> = {}) =>
	({ id: 'role-1', organizationId: 'org-1', roleName: 'fab user', ...overrides }) as SchemaOrganizationRole;
const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const saveButton = () => screen.queryByRole('button', { name: 'Save changes' }) as HTMLButtonElement | null;

async function click(element: HTMLElement) {
	await act(async () => {
		fireEvent.click(element);
	});
}

describe('EditOrganizationRoleModal', () => {
	it('shows the role’s permissions, and says when its cluster access is beyond the form', () => {
		render(<EditOrganizationRoleModal data={role()} isModalOpen closeModal={() => {}} />);
		expect(checkbox('Roles: View').checked).toBe(true);
		expect(checkbox('Roles: Create').checked).toBe(false);
		expect(checkbox('Clusters: Update').checked).toBe(true);
		expect(checkbox('Clusters: Update').disabled).toBe(true);
		expect(screen.getByText(/in a way this form can’t show\. Edit them in Advanced JSON/)).toBeTruthy();
	});

	it('reads a role limited to some clusters back as selected clusters', () => {
		roleInfo.value = {
			organization: {
				roles,
				clusters: { create: false, view: false, update: false, delete: false, resources: [override] },
			},
		};
		render(<EditOrganizationRoleModal data={role()} isModalOpen closeModal={() => {}} />);
		expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('selected');
		expect(checkbox('beta').checked).toBe(true);
		expect(checkbox('alpha').checked).toBe(false);
		expect(checkbox('Clusters: View').checked).toBe(true);
		expect(checkbox('Clusters: Update').checked).toBe(true);
		expect(checkbox('Clusters: Delete').checked).toBe(false);
	});

	it('keeps listing a deleted cluster the role still names, marked as deleted', () => {
		roleInfo.value = {
			organization: {
				roles,
				clusters: {
					create: false,
					view: false,
					update: false,
					delete: false,
					resources: [{ ...override, id: 'clu-c' }],
				},
			},
		};
		render(<EditOrganizationRoleModal data={role()} isModalOpen closeModal={() => {}} />);
		const gamma = screen.getByRole('checkbox', { name: /^gamma/ }) as HTMLInputElement;
		expect(gamma.checked).toBe(true);
		expect(gamma.closest('label')!.textContent).toBe('gamma(deleted)');
		expect(checkbox('alpha').checked).toBe(false);
	});

	it('saves a role whose name the create form would refuse, keeping its cluster entries, once something changed', async () => {
		render(<EditOrganizationRoleModal data={role()} isModalOpen closeModal={() => {}} />);
		expect(saveButton()!.disabled).toBe(true);
		await click(checkbox('Update organization'));
		expect(saveButton()!.disabled).toBe(false);
		await click(saveButton()!);
		expect(update.mock.calls[0][0]).toEqual({
			roleId: 'role-1',
			updatedRoleInfo: {
				name: 'fab user',
				organizationId: 'org-1',
				update: true,
				delete: false,
				roles,
				clusters: customClusters,
			},
		});
	});

	it('won’t save JSON that doesn’t describe a role', async () => {
		render(<EditOrganizationRoleModal data={role()} isModalOpen closeModal={() => {}} />);
		await act(async () => {
			fireEvent.mouseDown(screen.getByRole('tab', { name: 'Advanced JSON' }), { button: 0 });
		});
		await act(async () => {
			fireEvent.change(screen.getByLabelText('Permissions JSON'), { target: { value: '[]' } });
		});
		expect(screen.getByRole('alert')).toBeTruthy();
		expect(saveButton()!.disabled).toBe(true);
	});

	it('keeps the role as this edit found it when the background poll brings another admin’s change', async () => {
		const { rerender } = render(<EditOrganizationRoleModal data={role()} isModalOpen closeModal={() => {}} />);
		roleInfo.value = { organization: { update: true, delete: false, roles, clusters: customClusters } };
		await act(async () => {
			rerender(<EditOrganizationRoleModal data={role()} isModalOpen closeModal={() => {}} />);
		});
		expect(checkbox('Update organization').checked).toBe(false);
		expect(saveButton()!.disabled).toBe(true);
	});

	it('can save again after cancelling a delete that interrupted invalid JSON', async () => {
		render(<EditOrganizationRoleModal data={role()} isModalOpen closeModal={() => {}} />);
		await act(async () => {
			fireEvent.mouseDown(screen.getByRole('tab', { name: 'Advanced JSON' }), { button: 0 });
		});
		await act(async () => {
			fireEvent.change(screen.getByLabelText('Permissions JSON'), { target: { value: '{' } });
		});
		await click(screen.getByRole('button', { name: 'Delete role' }));
		await click(screen.getByRole('button', { name: 'Cancel' }));
		await click(checkbox('Update organization'));
		expect(saveButton()!.disabled).toBe(false);
	});

	it('shows the built-in admin role read only', () => {
		render(<EditOrganizationRoleModal data={role({ roleName: 'admin' })} isModalOpen closeModal={() => {}} />);
		expect(screen.getByText('The admin role is built in and can’t be edited.')).toBeTruthy();
		expect(checkbox('Roles: View').disabled).toBe(true);
		expect(saveButton()).toBeNull();
		expect(screen.queryByRole('button', { name: 'Delete role' })).toBeNull();
	});

	it('shows your own role read only', () => {
		auth.value = { user: { roles: { 'org-1': { id: 'role-1' } } } };
		render(<EditOrganizationRoleModal data={role()} isModalOpen closeModal={() => {}} />);
		expect(screen.getByText(/This is your role/)).toBeTruthy();
		expect(checkbox('Update organization').disabled).toBe(true);
		expect(saveButton()).toBeNull();
	});

	it('is read only to someone who can only view roles', () => {
		permissions.value = { update: false, remove: false };
		render(<EditOrganizationRoleModal data={role()} isModalOpen closeModal={() => {}} />);
		expect(checkbox('Update organization').disabled).toBe(true);
		expect(checkbox('Roles: View').disabled).toBe(true);
		expect(saveButton()).toBeNull();
	});

	it('deletes the role after confirmation', async () => {
		render(<EditOrganizationRoleModal data={role()} isModalOpen closeModal={() => {}} />);
		await click(screen.getByRole('button', { name: 'Delete role' }));
		await click(screen.getByRole('button', { name: 'Delete Role' }));
		expect(remove.mock.calls[0][0]).toEqual({ roleId: 'role-1' });
	});
});
