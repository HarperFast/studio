import { checkImportDataOperationsAllowed, checkTableActionAllowed } from '@/hooks/checkOperationPermission';
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
	return checkTableActionAllowed(permission, action) && checkTableGrant(permission, databaseName, tableName, action);
}

/**
 * Import Data needs the same insert grant Add Records needs, but its sources issue different
 * operations, so the allowlist half of the question differs.
 */
export function checkImportDataPermission(
	permission: LocalRolePermission | undefined,
	databaseName: string,
	tableName: string,
): boolean {
	return checkImportDataOperationsAllowed(permission) && checkTableGrant(permission, databaseName, tableName, 'insert');
}

function checkTableGrant(
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
	// Deliberately version-blind: Harper's permissionsTranslator hands a role the table permissions
	// under an `operations` key whenever a database of that name exists, so an upgraded v4 role
	// still has a real grant there. Passing `true` here would hide records the server still serves.
	return getDatabasePermissionRecord(permission, databaseName, false)?.tables?.[tableName]?.[action] === true;
}
