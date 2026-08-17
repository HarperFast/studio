import { LocalRolePermission, LocalRoleSchemaRecord } from '@/integrations/api/api.patch';

// Top-level LocalRolePermission keys that are NOT database names, in canonical display order.
// Harper reserves these in the permission object itself, so a database with one of these names
// cannot be expressed in role JSON at all — key identity, not value shape, is what decides.
const RESERVED_KEY_ORDER = ['super_user', 'structure_user', 'cluster_user', 'operations'] as const;
export const RESERVED_PERMISSION_KEYS: ReadonlySet<string> = new Set(RESERVED_KEY_ORDER);

/**
 * The database-scoped record under a LocalRolePermission key, or undefined for reserved keys and
 * malformed values (null, booleans, arrays).
 *
 * `operations` is special-cased by value shape rather than key alone: pre-5.0 Harper had no
 * reserved `operations` field, so a v4 role can hold real table permissions for a database with
 * that name. An allowlist is always an array and a database record never is, so the shape
 * disambiguates the two worlds without needing the instance version here.
 */
export function getDatabasePermissionRecord(
	permission: LocalRolePermission,
	databaseName: string,
): LocalRoleSchemaRecord | undefined {
	if (databaseName !== 'operations' && RESERVED_PERMISSION_KEYS.has(databaseName)) {
		return undefined;
	}
	// hasOwn, so a database named `__proto__` reads its own entry rather than Object.prototype.
	if (!Object.hasOwn(permission, databaseName)) {
		return undefined;
	}
	const record = permission[databaseName];
	return record !== null && typeof record === 'object' && !Array.isArray(record) ? record : undefined;
}

/**
 * Whether Harper refuses to store an allowlist alongside this role's flags. `validateNoSUPerms`
 * rejects add_role/alter_role when a permission with more than one key sets `super_user: true` or
 * `cluster_user: true` — so the two cannot coexist and the save fails, rather than the allowlist
 * being merely inert. `structure_user` is deliberately not covered by that check.
 */
export function rolePreventsOperationsAllowlist(permission: LocalRolePermission | undefined): boolean {
	return permission?.super_user === true || permission?.cluster_user === true;
}

/**
 * Whether this role reaches DDL operations without consulting the allowlist. verifyPerms returns
 * early for structure users on create/drop table and attribute (and on create/drop database when
 * the flag is `true`); every other operation still goes through the gate.
 */
export function structureUserBypassesDdl(permission: LocalRolePermission | undefined): boolean {
	return !!permission?.structure_user;
}

/** The DDL operations a structure_user role reaches regardless of its allowlist. */
export const STRUCTURE_USER_DDL_OPERATIONS = [
	'create_table',
	'create_attribute',
	'drop_table',
	'drop_attribute',
];

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
