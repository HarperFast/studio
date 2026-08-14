import { LocalRolePermission, LocalRoleSchemaRecord } from '@/integrations/api/api.patch';

// Top-level LocalRolePermission keys that are NOT database names, in canonical display order.
// Harper reserves these in the permission object itself, so a database with one of these names
// cannot be expressed in role JSON at all — key identity, not value shape, is what decides.
const RESERVED_KEY_ORDER = ['super_user', 'structure_user', 'cluster_user', 'operations'] as const;
export const RESERVED_PERMISSION_KEYS: ReadonlySet<string> = new Set(RESERVED_KEY_ORDER);

/**
 * The database-scoped record under a LocalRolePermission key, or undefined for reserved keys and
 * malformed values (null, booleans, arrays).
 */
export function getDatabasePermissionRecord(
	permission: LocalRolePermission,
	databaseName: string,
): LocalRoleSchemaRecord | undefined {
	if (RESERVED_PERMISSION_KEYS.has(databaseName)) {
		return undefined;
	}
	const record = permission[databaseName];
	return record !== null && typeof record === 'object' && !Array.isArray(record) ? record : undefined;
}

/**
 * The role's operations allowlist, but only when it is well-formed (an array of strings).
 * Anything else — absent, or a shape the structured UI must not touch — is undefined; use
 * hasMalformedOperations to tell those apart.
 */
export function getOperationsAllowlist(permission: LocalRolePermission | undefined): string[] | undefined {
	const operations = permission?.operations;
	return Array.isArray(operations) && operations.every((entry) => typeof entry === 'string')
		? operations
		: undefined;
}

/** An `operations` key is present but not an array of strings. */
export function hasMalformedOperations(permission: LocalRolePermission | undefined): boolean {
	return permission?.operations !== undefined && getOperationsAllowlist(permission) === undefined;
}

/**
 * Rebuilds the permission with reserved keys first (in canonical order) and database keys after,
 * preserving their relative order — so `operations` sits visibly at the top of the JSON editor
 * instead of below hundreds of table permissions.
 */
export function orderPermissionKeys(permission: LocalRolePermission): LocalRolePermission {
	const reserved = RESERVED_KEY_ORDER.filter((key) => key in permission);
	const databases = Object.keys(permission).filter((key) => !RESERVED_PERMISSION_KEYS.has(key));
	return Object.fromEntries(
		[...reserved, ...databases].map((key) => [key, permission[key]]),
	) as LocalRolePermission;
}

/**
 * A copy of the permission with the operations allowlist set (or removed when undefined), with
 * keys in canonical order.
 */
export function withOperations(
	permission: LocalRolePermission,
	operations: string[] | undefined,
): LocalRolePermission {
	const next = { ...permission };
	if (operations === undefined) {
		delete next.operations;
	} else {
		next.operations = operations;
	}
	return orderPermissionKeys(next);
}
