import { preparePermissionForSave } from '@/features/instance/config/roles/preparePermissionForSave';
import { LocalRolePermission } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';

const tablePerms = {
	data: { tables: { dog: { read: true, insert: false, update: false, delete: false, attribute_permissions: null } } },
};

describe('preparePermissionForSave', () => {
	it('leaves non-elevated roles untouched', () => {
		const permission: LocalRolePermission = { operations: ['read_only'], ...tablePerms };
		expect(preparePermissionForSave(permission)).toEqual({ operations: ['read_only'], ...tablePerms });
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
