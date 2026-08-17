import { LocalRolePermission, LocalRoleSchemaRecord } from '@/integrations/api/api.patch';

// Top-level LocalRolePermission keys that are NOT database names, in canonical display order.
// Key identity decides for the three flags: Harper reserves them in the permission object itself,
// so a database with one of those names cannot be expressed in role JSON at all. `operations` is
// the exception — pre-5.0 Harper reserved nothing by that name, so there value SHAPE decides
// (an allowlist is an array; a database record is not). See getDatabasePermissionRecord and
// classifyOperationsValue, which must stay consistent with each other.
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
 * Which DDL this role reaches without consulting the allowlist, matching verifyPerms:
 * - `true`: an unscoped structure user — the four table/attribute DDL operations anywhere, plus
 *   create/drop database (that pair requires the boolean form).
 * - an array: DDL on those databases only, and never create/drop database.
 * - `false`: not a structure user; every operation goes through the gate.
 * Everything outside that carve-out is still gated for both forms.
 */
export function structureUserDdlScope(
	permission: LocalRolePermission | undefined,
): true | string[] | false {
	const structureUser = permission?.structure_user;
	if (structureUser === true) {
		return true;
	}
	return Array.isArray(structureUser) && structureUser.length > 0 ? structureUser : false;
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

/**
 * What the `operations` key holds:
 * - `absent`: no key at all.
 * - `allowlist`: a well-formed array of operation names (Harper 5.0+).
 * - `database`: a table-permission record, i.e. a pre-5.0 role granting a database that happens to
 *   be named `operations`. Legitimate, and not something to ask the author to "fix".
 * - `malformed`: present but neither of the above (`true`, a mixed array, a bare string).
 */
export function classifyOperationsValue(
	permission: LocalRolePermission | undefined,
): 'absent' | 'allowlist' | 'database' | 'malformed' {
	const operations = permission?.operations;
	if (operations === undefined) {
		return 'absent';
	}
	if (getOperationsAllowlist(permission) !== undefined) {
		return 'allowlist';
	}
	return operations !== null && typeof operations === 'object' && !Array.isArray(operations)
			&& 'tables' in operations
		? 'database'
		: 'malformed';
}

/** An `operations` key is present but is neither an allowlist nor a pre-5.0 database record. */
export function hasMalformedOperations(permission: LocalRolePermission | undefined): boolean {
	return classifyOperationsValue(permission) === 'malformed';
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
