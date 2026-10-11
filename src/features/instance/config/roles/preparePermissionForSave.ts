import { LocalRolePermission } from '@/integrations/api/api.patch';
import { RESERVED_PERMISSION_KEYS, rolePreventsOperationsAllowlist } from '@/integrations/api/localRolePermission';

/**
 * Normalizes an edited permission object before alter_role, without mutating the input.
 * Roles that are unconditionally super/structure/cluster users don't need per-table permissions,
 * so those are dropped for them. False top-level flags are dropped as noise.
 *
 * `operations` survives only where Harper accepts it: `validateNoSUPerms` rejects any multi-key
 * permission setting `super_user: true` or `cluster_user: true`, so keeping the allowlist there
 * would fail the save outright — it is dropped alongside the table permissions instead. A
 * `structure_user` role may carry one (the gate still runs for everything but DDL), and it
 * survives only as an actual array: any other shape under that key is not an allowlist.
 *
 * `structure_user` may also be an array of database names, which grants DDL on *those* databases
 * only — such a role still relies on its explicit table permissions elsewhere, so it keeps them.
 *
 * A table's `attribute_permissions: null` is sent as `[]`, which means the same thing (no attribute
 * scoping). Harper accepts and stores `null`, then 500s every `get_attributes: ['*']` search the role
 * makes (HarperFast/harper#3143), so a role stored that way can never read its rows until re-saved.
 */
export function preparePermissionForSave(parsedPermissions: LocalRolePermission): LocalRolePermission {
	if (
		!(parsedPermissions.super_user === true || parsedPermissions.structure_user === true
			|| parsedPermissions.cluster_user === true)
	) {
		return withAttributePermissionArrays(parsedPermissions);
	}
	const allowlistRejected = rolePreventsOperationsAllowlist(parsedPermissions);
	const prepared = { ...parsedPermissions };
	for (const key in prepared) {
		if (
			!RESERVED_PERMISSION_KEYS.has(key)
			|| (key === 'operations' && (allowlistRejected || !Array.isArray(prepared.operations)))
		) {
			// If you're a super, structure or cluster user, you don't need more specific permissions.
			delete prepared[key];
		} else if (prepared[key] === false) {
			// If you've set one of the top-level properties, clear out any others set to false.
			delete prepared[key];
		}
	}
	return prepared;
}

// Object.fromEntries, not assignment: Harper permits a database or table named `__proto__`, and
// assigning that key would hit the prototype setter instead of copying the entry.
function withAttributePermissionArrays(permission: LocalRolePermission): LocalRolePermission {
	return Object.fromEntries(
		Object.entries(permission).map(([key, value]) => [key, withTableAttributePermissionArrays(value)]),
	) as LocalRolePermission;
}

function withTableAttributePermissionArrays(value: LocalRolePermission[string]): LocalRolePermission[string] {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return value;
	}
	const { tables } = value;
	if (tables === null || typeof tables !== 'object' || Array.isArray(tables)) {
		return value;
	}
	return {
		...value,
		tables: Object.fromEntries(
			Object.entries(tables).map(([tableName, table]) => [
				tableName,
				table !== null && typeof table === 'object' && 'attribute_permissions' in table
					&& table.attribute_permissions === null
					? { ...table, attribute_permissions: [] }
					: table,
			]),
		),
	};
}
