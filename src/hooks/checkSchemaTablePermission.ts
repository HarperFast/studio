import { LocalRolePermission, LocalRolePermissionAction } from '@/integrations/api/api.patch';
import { getDatabasePermissionRecord } from '@/integrations/api/localRolePermission';

/**
 * Pure table-permission check, kept out of `usePermissions` (and its auth-store imports) so the
 * restricted-user path is unit-testable in isolation. A database whose `tables` map lacks the table
 * (common for a non-`structure_user`) must return `false`, not crash -- the optional chain on
 * `[tableName]` is load-bearing (it previously threw for any restricted user opening a table menu).
 */
export function checkSchemaTablePermission(
	permission: LocalRolePermission | undefined,
	databaseName: string,
	tableName: string,
	action: LocalRolePermissionAction,
): boolean {
	if (!permission) {
		// If we don't yet have record of their permission, deny access.
		// (We're probably still loading the user.)
		return false;
	}
	if (permission.super_user === true || permission.structure_user === true) {
		return true;
	}
	return getDatabasePermissionRecord(permission, databaseName)?.tables?.[tableName]?.[action] === true;
}
