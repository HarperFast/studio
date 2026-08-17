/**
 * @vitest-environment jsdom
 */
import { ContextMenu, ContextMenuContent } from '@/components/ui/contextMenu';
import { TableContextMenuItems } from '@/features/instance/databases/components/TableContextMenuItems';
import { LocalRolePermission } from '@/integrations/api/api.patch';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The permission hooks read the signed-in role from the auth store and the ids from the router; both
// are mocked so the real allowlist -> hook -> rendered control path is what the assertions exercise.
const permission = vi.hoisted(() => ({ current: undefined as LocalRolePermission | undefined }));

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ instanceId: 'instance-1' }),
}));

vi.mock('@/hooks/useAuth', () => ({
	useInstanceAuth: () => ({ user: { role: { permission: permission.current } } }),
	isAdminMode: () => false,
	useCloudAuth: () => ({ user: null }),
}));

vi.mock('@/features/instance/databases/hooks/useExportTableCsv', () => ({
	useExportTableCsv: () => ({ exportCsv: () => undefined }),
}));

function renderMenu(rolePermission: Record<string, unknown>) {
	permission.current = rolePermission as unknown as LocalRolePermission;
	return render(
		<ContextMenu open>
			<ContextMenuContent forceMount>
				<TableContextMenuItems
					databaseName="data"
					tableName="dog"
					instanceDatabaseMap={{ data: { dog: {}, cat: {} } } as never}
				/>
			</ContextMenuContent>
		</ContextMenu>,
	);
}

const addRecords = () => screen.queryByText('Add New Record(s)');
const importData = () => screen.queryByText('Import Data');

afterEach(() => {
	cleanup();
	permission.current = undefined;
});

describe('TableContextMenuItems allowlist gating', () => {
	it('offers both write entries to an unrestricted super_user', () => {
		renderMenu({ super_user: true });
		expect(addRecords()).not.toBeNull();
		expect(importData()).not.toBeNull();
	});

	it('hides both from a role the allowlist limits to reads', () => {
		renderMenu({ operations: ['read_only'], data: { tables: { dog: tableGrant() } } });
		expect(addRecords()).toBeNull();
		expect(importData()).toBeNull();
	});

	// The two entries issue different operations, so a CSV grant keeps Import Data while Add Records --
	// which sends `insert` -- goes away.
	it('keeps Import Data but drops Add Records for a bulk-load grant', () => {
		renderMenu({ operations: ['csv_url_load', 'get_job'], data: { tables: { dog: tableGrant() } } });
		expect(addRecords()).toBeNull();
		expect(importData()).not.toBeNull();
	});

	it('hides Import Data when a CSV load has no get_job to poll with', () => {
		renderMenu({ operations: ['csv_url_load'], data: { tables: { dog: tableGrant() } } });
		expect(importData()).toBeNull();
	});

	it('offers both when the allowlist names insert', () => {
		renderMenu({ operations: ['insert'], data: { tables: { dog: tableGrant() } } });
		expect(addRecords()).not.toBeNull();
		expect(importData()).not.toBeNull();
	});

	it('offers neither while the permission is still loading', () => {
		renderMenu(undefined as never);
		expect(addRecords()).toBeNull();
		expect(importData()).toBeNull();
	});
});

function tableGrant() {
	return { read: true, insert: true, update: false, delete: false, attribute_permissions: null };
}
