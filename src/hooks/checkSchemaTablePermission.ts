import {
	checkAnyOperationAllowed,
	checkImportDataOperationsAllowed,
	checkTableActionAllowed,
} from '@/hooks/checkOperationPermission';
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
 * Whether this role can `put` (create-or-replace) records in this table.
 *
 * Deliberately NOT `checkSchemaTablePermission('update') && checkSchemaTablePermission('insert')`:
 * that ANDs in the `update` and `insert` *operation* allowlists, which Harper does not ask for. Harper
 * authorizes `put` from the raw table insert/update flags plus a `put` allowlist entry
 * (`utility/operation_authorization.ts`: `requiredPermissions` for `put` is `[INSERT_PERM,
 * UPDATE_PERM]` under `OPERATIONS_ENUM.PUT`), so a role with `operations: ['put']` and both table
 * flags is valid server-side and must not be blocked here.
 *
 * An attribute-scoped role is refused outright, matching Harper's `PUT_WITH_ATTRIBUTE_PERMS` denial: a
 * replace drops every attribute the request omits, which the attribute check cannot police because it
 * only sees the attributes a request supplies. The table flags can be true while
 * `attribute_permissions` is non-empty, so without this the editor would offer a save that 403s.
 *
 * Only `super_user` short-circuits. `structure_user` short-circuits DDL, not DML, so it still needs
 * the real grants here.
 */
export function checkTablePutPermission(
	permission: LocalRolePermission | undefined,
	databaseName: string,
	tableName: string,
): boolean {
	if (!permission) {
		return false;
	}
	if (permission.super_user === true) {
		return true;
	}
	if (!checkAnyOperationAllowed(permission, ['put'])) {
		return false;
	}
	const table = getDatabasePermissionRecord(permission, databaseName, false)?.tables?.[tableName];
	if (table?.insert !== true || table.update !== true) {
		return false;
	}
	// Both spellings: a v5 role scopes attributes under `attribute_permissions`, a translated v4 role
	// under `attribute_restrictions`. Either one non-empty means Harper denies the `put`.
	//
	// Checked independently rather than as an either/or on which key is present: a translated payload
	// carrying `attribute_permissions: null` alongside a populated `attribute_restrictions` would
	// otherwise read the null one and allow a save the server refuses.
	//
	// `in` rather than `Object.hasOwn` — the opposite of the rule this change set applies to record
	// attributes — because only `in` narrows the union for TypeScript, and neither key exists on
	// `Object.prototype`, so there is no inherited-property hazard to guard against here.
	const attributeScoped = ('attribute_permissions' in table && table.attribute_permissions?.length)
		|| ('attribute_restrictions' in table && table.attribute_restrictions?.length);
	return !attributeScoped;
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
