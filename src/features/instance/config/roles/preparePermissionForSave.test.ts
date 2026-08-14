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

	it('drops per-table permissions and false flags for elevated roles', () => {
		const permission: LocalRolePermission = { super_user: true, structure_user: false, ...tablePerms };
		expect(preparePermissionForSave(permission)).toEqual({ super_user: true });
	});

	it('keeps an operations allowlist on an elevated role — it restricts super users too', () => {
		const permission: LocalRolePermission = {
			super_user: true,
			operations: ['read_only', 'deploy_component'],
			...tablePerms,
		};
		expect(preparePermissionForSave(permission)).toEqual({
			super_user: true,
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
