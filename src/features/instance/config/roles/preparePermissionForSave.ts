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
 * only — such a role still relies on its explicit table permissions elsewhere, so it is left alone.
 */
export function preparePermissionForSave(parsedPermissions: LocalRolePermission): LocalRolePermission {
	if (
		!(parsedPermissions.super_user === true || parsedPermissions.structure_user === true
			|| parsedPermissions.cluster_user === true)
	) {
		return parsedPermissions;
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
