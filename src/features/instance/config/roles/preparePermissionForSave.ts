import { LocalRolePermission } from '@/integrations/api/api.patch';
import { RESERVED_PERMISSION_KEYS } from '@/integrations/api/localRolePermission';

/**
 * Normalizes an edited permission object before alter_role. Super/structure/cluster users don't
 * need per-table permissions, so those are dropped for them — but an `operations` allowlist
 * restricts even super users (unlisted operations are denied outright) and must survive. It only
 * survives as an actual array: any other shape under that key is not an allowlist and is dropped
 * like the table permissions it presumably is. False top-level flags are dropped as noise.
 * Mutates and returns the given object.
 */
export function preparePermissionForSave(parsedPermissions: LocalRolePermission): LocalRolePermission {
	if (parsedPermissions.super_user || parsedPermissions.structure_user || parsedPermissions.cluster_user) {
		for (const parsedPermissionsKey in parsedPermissions) {
			if (
				!RESERVED_PERMISSION_KEYS.has(parsedPermissionsKey)
				|| (parsedPermissionsKey === 'operations' && !Array.isArray(parsedPermissions.operations))
			) {
				// If you're a super, structure or cluster user, you don't need more specific permissions.
				delete parsedPermissions[parsedPermissionsKey];
			} else if (parsedPermissions[parsedPermissionsKey] === false) {
				// If you've set one of the top-level properties, clear out any others set to false.
				delete parsedPermissions[parsedPermissionsKey];
			}
		}
	}
	return parsedPermissions;
}
