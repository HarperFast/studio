import { LocalRolePermission } from '@/integrations/api/api.patch';
import { RESERVED_PERMISSION_KEYS } from '@/integrations/api/localRolePermission';

/**
 * Normalizes an edited permission object before alter_role, without mutating the input.
 * Roles that are unconditionally super/structure/cluster users don't need per-table permissions,
 * so those are dropped for them. An `operations` allowlist is kept as-is (it is inert on such a
 * role, but silently deleting what the author typed is worse than round-tripping it) and only as
 * an actual array: any other shape under that key is not an allowlist and is dropped like the
 * table permissions it presumably is. False top-level flags are dropped as noise.
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
	const prepared = { ...parsedPermissions };
	for (const key in prepared) {
		if (
			!RESERVED_PERMISSION_KEYS.has(key)
			|| (key === 'operations' && !Array.isArray(prepared.operations))
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
