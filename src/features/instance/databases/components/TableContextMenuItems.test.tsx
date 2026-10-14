/**
 * @vitest-environment jsdom
 */
import { ContextMenu, ContextMenuContent } from '@/components/ui/contextMenu';
import { TableContextMenuItems } from '@/features/instance/databases/components/TableContextMenuItems';
import { LocalRolePermission } from '@/integrations/api/api.patch';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The permission hooks read the signed-in role from the auth store and the ids from the router; both
// are mocked so the real allowlist -> hook -> rendered control path is what the assertions exercise.
const permission = vi.hoisted(() => ({ current: undefined as LocalRolePermission | undefined }));
const exportCsvSpy = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ instanceId: 'instance-1' }),
}));

vi.mock('@/hooks/useAuth', () => ({
	useInstanceAuth: () => ({ user: { role: { permission: permission.current } } }),
	isAdminMode: () => false,
	useCloudAuth: () => ({ user: null }),
}));

vi.mock('@/features/instance/databases/hooks/useExportTableCsv', () => ({
	useExportTableCsv: () => ({ exportCsv: exportCsvSpy }),
}));

const keyedTable = { primary_key: 'id', attributes: [{ attribute: 'id', is_primary_key: true }] };

function renderMenu(rolePermission: Record<string, unknown>, dog: Record<string, unknown> = keyedTable) {
	return renderMenuOver(rolePermission, { data: { dog, cat: keyedTable } });
}

function renderMenuOver(rolePermission: Record<string, unknown>, instanceDatabaseMap: unknown) {
	permission.current = rolePermission as unknown as LocalRolePermission;
	const menu = (map: unknown) => (
		<ContextMenu open>
			<ContextMenuContent forceMount>
				<TableContextMenuItems databaseName="data" tableName="dog" instanceDatabaseMap={map as never} />
			</ContextMenuContent>
		</ContextMenu>
	);
	const view = render(menu(instanceDatabaseMap));
	return { ...view, rerenderOver: (map: unknown) => view.rerender(menu(map)) };
}

const addRecords = () => screen.queryByText('Add New Record(s)');
const importData = () => screen.queryByText('Import Data');
const exportCsv = () => screen.getByRole('menuitem', { name: 'Export CSV' });

afterEach(() => {
	cleanup();
	permission.current = undefined;
	exportCsvSpy.mockClear();
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

describe('TableContextMenuItems on a table with no primary key', () => {
	it('withdraws Add and Import and disables Export, even for a super_user', () => {
		renderMenu({ super_user: true }, { attributes: [] });
		expect(addRecords()).toBeNull();
		expect(importData()).toBeNull();
		expect(exportCsv().hasAttribute('data-disabled')).toBe(true);
	});

	it('leaves Export enabled on a keyed table', () => {
		renderMenu({ super_user: true });
		expect(exportCsv().hasAttribute('data-disabled')).toBe(false);
	});
});

describe('TableContextMenuItems on a table the map does not describe', () => {
	function expectNothingOffered() {
		expect(addRecords()).toBeNull();
		expect(importData()).toBeNull();
		expect(exportCsv().hasAttribute('data-disabled')).toBe(true);
		fireEvent.click(exportCsv());
		expect(exportCsvSpy).not.toHaveBeenCalled();
	}

	it('offers nothing that needs its key while the map is missing', () => {
		renderMenuOver({ super_user: true }, undefined);
		expectNothingOffered();
	});

	it('offers nothing that needs its key when the map lacks the table', () => {
		renderMenuOver({ super_user: true }, { data: { cat: keyedTable } });
		expectNothingOffered();
	});

	// Both menus list tables from the map, so an open one meets an undescribed table when a refetch
	// lands without it: another tab or user dropped it.
	it('withdraws them from an open menu once a refetched map drops the table', () => {
		const { rerenderOver } = renderMenuOver({ super_user: true }, { data: { dog: keyedTable, cat: keyedTable } });
		expect(exportCsv().hasAttribute('data-disabled')).toBe(false);

		rerenderOver({ data: { cat: keyedTable } });
		expectNothingOffered();
	});
});

describe('TableContextMenuItems Export CSV', () => {
	// The export names a table's computed attributes from its describe, which the browse page's
	// describe_all carries; without it the exported file leaves their values out (#1820).
	it('hands the export the table and its database from the map', () => {
		renderMenu({ super_user: true });
		fireEvent.click(exportCsv());
		expect(exportCsvSpy).toHaveBeenCalledWith(expect.objectContaining({
			primaryKey: 'id',
			instanceTable: keyedTable,
			databaseTables: { dog: keyedTable, cat: keyedTable },
		}));
	});
});

function tableGrant() {
	return { read: true, insert: true, update: false, delete: false, attribute_permissions: null };
}
