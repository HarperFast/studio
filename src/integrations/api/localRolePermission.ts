import { LocalRolePermission, LocalRoleSchemaRecord } from '@/integrations/api/api.patch';

// Top-level LocalRolePermission keys that are NOT database names, in canonical display order.
// The three flags are reserved on every version, so a database can never carry those names.
// `operations` depends on the instance: at or above the allowlist floor it is the allowlist key
// and never a database, below it Harper reserved nothing by that name and it is an ordinary
// database. That single rule is what getDatabasePermissionRecord decides; classifyOperationsValue
// delegates to it rather than repeating the shape test, so the two cannot drift apart.
const RESERVED_KEY_ORDER = ['super_user', 'structure_user', 'cluster_user', 'operations'] as const;
export const RESERVED_PERMISSION_KEYS: ReadonlySet<string> = new Set(RESERVED_KEY_ORDER);

/**
 * The database-scoped record under a LocalRolePermission key, or undefined for reserved keys and
 * values that are not a record (null, booleans, arrays).
 *
 * `operationsIsAllowlist` settles the one ambiguous key, and the right answer depends on the
 * question being asked, not only on the version:
 * - Editing a role (`supportsOperationsAllowlist(version)`): at or above the floor the key is the
 *   allowlist and must never be rewritten as a database.
 * - Checking table access (`false`): Harper's permissionsTranslator overwrites the key with the
 *   translated table permissions for a database of that name on every version, so an upgraded v4
 *   role still holds a real grant there. A genuine allowlist is excluded by the array test below.
 */
export function getDatabasePermissionRecord(
	permission: LocalRolePermission,
	databaseName: string,
	operationsIsAllowlist: boolean,
): LocalRoleSchemaRecord | undefined {
	if (databaseName === 'operations' ? operationsIsAllowlist : RESERVED_PERMISSION_KEYS.has(databaseName)) {
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
 * What the `operations` key holds. The verdict depends on the instance, so `allowlistSupported`
 * (i.e. supportsOperationsAllowlist for that version) is required rather than defaulted:
 * - `absent`: no key at all.
 * - `allowlist`: a well-formed array of operation names.
 * - `database`: a table-permission record on an instance BELOW the allowlist floor, i.e. a role
 *   granting a database that happens to be named `operations`. Legitimate there, and not something
 *   to ask the author to "fix".
 * - `malformed`: anything else. On a supporting instance that includes a record, because
 *   role_validation rejects a non-array `operations` outright (OPERATIONS_MUST_BE_ARRAY) — so
 *   there it is a broken allowlist, and callers must leave it alone rather than overwrite it.
 */
export function classifyOperationsValue(
	permission: LocalRolePermission | undefined,
	allowlistSupported: boolean,
): 'absent' | 'allowlist' | 'database' | 'malformed' {
	if (permission?.operations === undefined) {
		return 'absent';
	}
	if (allowlistSupported) {
		// Above the floor the key is the allowlist, so anything but a string array is a broken one.
		return getOperationsAllowlist(permission) !== undefined ? 'allowlist' : 'malformed';
	}
	// Below it the key is an ordinary database, judged by the same test as any other database.
	return getDatabasePermissionRecord(permission, 'operations', false) !== undefined ? 'database' : 'malformed';
}

/** An `operations` key is present but is neither an allowlist nor a pre-5.0 database record. */
export function hasMalformedOperations(
	permission: LocalRolePermission | undefined,
	allowlistSupported: boolean,
): boolean {
	return classifyOperationsValue(permission, allowlistSupported) === 'malformed';
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
