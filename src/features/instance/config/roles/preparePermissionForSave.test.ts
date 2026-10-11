import { preparePermissionForSave } from '@/features/instance/config/roles/preparePermissionForSave';
import { LocalRolePermission } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';

const tablePerms = {
	data: { tables: { dog: { read: true, insert: false, update: false, delete: false, attribute_permissions: [] } } },
};

const readOnlyTable = (attributePermissions: unknown) => ({
	read: true,
	insert: false,
	update: false,
	delete: false,
	attribute_permissions: attributePermissions,
});

describe('preparePermissionForSave', () => {
	it('leaves non-elevated roles untouched', () => {
		const permission: LocalRolePermission = { operations: ['read_only'], ...tablePerms };
		expect(preparePermissionForSave(permission)).toEqual({ operations: ['read_only'], ...tablePerms });
	});

	it('sends a null attribute_permissions as [], which Harper otherwise 500s on for every read', () => {
		const stored = { read: true, insert: false, update: false, delete: false, attribute_permissions: null };
		const permission = {
			super_user: false,
			dev: { tables: { dog: stored, cat: readOnlyTable(null) } },
		} as unknown as LocalRolePermission;

		expect(preparePermissionForSave(permission)).toEqual({
			super_user: false,
			dev: { tables: { dog: readOnlyTable([]), cat: readOnlyTable([]) } },
		});
		expect(stored.attribute_permissions).toBeNull();
	});

	it('keeps scoped attribute permissions and legacy attribute_restrictions as they are', () => {
		const scoped = [{ attribute_name: 'id', read: true, insert: false, update: false }];
		const legacy = { read: true, insert: false, update: false, delete: false, attribute_restrictions: [] };
		const permission = {
			dev: { tables: { dog: readOnlyTable(scoped), cat: legacy } },
		} as unknown as LocalRolePermission;

		expect(preparePermissionForSave(permission)).toEqual({
			dev: { tables: { dog: readOnlyTable(scoped), cat: legacy } },
		});
	});

	it('repairs a database-scoped structure_user role too — it keeps its table permissions', () => {
		const permission = {
			structure_user: ['dev'],
			data: { tables: { dog: readOnlyTable(null) } },
		} as unknown as LocalRolePermission;
		expect(preparePermissionForSave(permission)).toEqual({
			structure_user: ['dev'],
			data: { tables: { dog: readOnlyTable([]) } },
		});
	});

	it('keeps a database or table named __proto__ as an own key while repairing it', () => {
		// JSON.parse, as the editor does: a literal `__proto__` key would set the prototype instead.
		const permission = JSON.parse(
			'{"__proto__":{"tables":{"__proto__":{"read":true,"insert":false,"update":false,"delete":false,'
				+ '"attribute_permissions":null}}}}',
		) as LocalRolePermission;

		const roundTripped = JSON.parse(JSON.stringify(preparePermissionForSave(permission))) as object;
		const database = Object.getOwnPropertyDescriptor(roundTripped, '__proto__')?.value as
			| { tables: object }
			| undefined;
		const table = database && Object.getOwnPropertyDescriptor(database.tables, '__proto__')?.value;
		expect(table).toEqual(readOnlyTable([]));
	});

	it('drops per-table permissions and false flags for elevated roles, without mutating the input', () => {
		const permission: LocalRolePermission = { super_user: true, structure_user: false, ...tablePerms };
		expect(preparePermissionForSave(permission)).toEqual({ super_user: true });
		expect(permission.data).toBe(tablePerms.data);
		expect(permission.structure_user).toBe(false);
	});

	it('leaves a database-scoped structure_user role alone — it still needs its table permissions', () => {
		// `structure_user: ['dev']` grants DDL on `dev` only; other databases rely on explicit CRUD.
		const permission = { structure_user: ['dev'], ...tablePerms } as unknown as LocalRolePermission;
		expect(preparePermissionForSave(permission)).toEqual({ structure_user: ['dev'], ...tablePerms });
	});

	it('drops the allowlist for super_user and cluster_user — Harper rejects the combination', () => {
		// validateNoSUPerms errors on any multi-key permission setting super_user/cluster_user, so
		// keeping the allowlist here would fail the save outright.
		const superUser: LocalRolePermission = { super_user: true, operations: ['read_only'], ...tablePerms };
		expect(preparePermissionForSave(superUser)).toEqual({ super_user: true });

		const clusterUser: LocalRolePermission = { cluster_user: true, operations: ['read_only'] };
		expect(preparePermissionForSave(clusterUser)).toEqual({ cluster_user: true });
	});

	it('keeps the allowlist for a structure_user role, which Harper does accept and enforce', () => {
		const permission: LocalRolePermission = {
			structure_user: true,
			operations: ['read_only', 'deploy_component'],
			...tablePerms,
		};
		expect(preparePermissionForSave(permission)).toEqual({
			structure_user: true,
			operations: ['read_only', 'deploy_component'],
		});
	});

	it('drops a non-array operations value on an elevated role, like any table permission', () => {
		// The collision case: table permissions for a database literally named `operations`
		// must not be sent to alter_role as an allowlist.
		const permission = { super_user: true, operations: { tables: {} } } as unknown as LocalRolePermission;
		expect(preparePermissionForSave(permission)).toEqual({ super_user: true });
	});
});
