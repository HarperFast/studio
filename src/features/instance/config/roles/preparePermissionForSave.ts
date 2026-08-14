import { LocalRolePermission } from '@/integrations/api/api.patch';
import { RESERVED_PERMISSION_KEYS } from '@/integrations/api/localRolePermission';

/**
 * Normalizes an edited permission object before alter_role, without mutating the input.
 * Super/structure/cluster users don't need per-table permissions, so those are dropped for them —
 * but an `operations` allowlist restricts even super users (unlisted operations are denied
 * outright) and must survive. It only survives as an actual array: any other shape under that key
 * is not an allowlist and is dropped like the table permissions it presumably is. False top-level
 * flags are dropped as noise.
 */
export function preparePermissionForSave(parsedPermissions: LocalRolePermission): LocalRolePermission {
	if (!(parsedPermissions.super_user || parsedPermissions.structure_user || parsedPermissions.cluster_user)) {
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
