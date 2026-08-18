import { LocalRolePermission, LocalRoleSchemaRecord } from '@/integrations/api/api.patch';

// Top-level LocalRolePermission keys that are NOT database names, in canonical display order.
// The three flags are reserved on every version, so a database can never carry those names.
//
// `operations` is genuinely ambiguous, and the two readers of it ask DIFFERENT questions — they
// are meant to answer differently, so don't re-unify them:
// - "Is this the allowlist?" (the role editor) — yes at or above the floor, where a non-array is a
//   broken allowlist Harper's role_validation rejects.
// - "Is there a table-permission record here?" (the access checks) — yes whenever the value is
//   record-shaped, on every version: permissionsTranslator hands a role those table permissions
//   for a database of that name regardless, so an upgraded v4 role still holds a live grant.
// getDatabasePermissionRecord takes that question as `operationsIsAllowlist`; the access-check
// callers pass `false` deliberately, and classifyOperationsValue delegates for the shape test so
// the two never disagree about what a *record* is.
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
 * isUneditableOperationsValue to tell those apart.
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
 * - `database-collision`: the same record at or above the floor, typically a v4 role carried
 *   through an upgrade. role_validation would reject re-saving it, yet permissionsTranslator still
 *   grants those tables — so it must be described, never "fixed" in place: replacing it with an
 *   array makes `perms.operations.tables[t]` throw and fails permission translation for every
 *   request that user makes.
 * - `malformed`: anything else — `true`, a bare string, a mixed array.
 */
export function classifyOperationsValue(
	permission: LocalRolePermission | undefined,
	allowlistSupported: boolean,
): 'absent' | 'allowlist' | 'database' | 'database-collision' | 'malformed' {
	if (permission?.operations === undefined) {
		return 'absent';
	}
	if (allowlistSupported && getOperationsAllowlist(permission) !== undefined) {
		return 'allowlist';
	}
	// The same shape test the access checks use, so the two never disagree about what a record is.
	if (getDatabasePermissionRecord(permission, 'operations', false) !== undefined) {
		return allowlistSupported ? 'database-collision' : 'database';
	}
	return 'malformed';
}

/**
 * Whether the structured editor must keep its hands off this value: anything present that isn't a
 * well-formed allowlist. Every such value — a record, `true`, a mixed array — throws the same way
 * in Harper's user-cache expansion, so the surfaces treat them alike; classifyOperationsValue
 * still separates them for anyone who needs the distinction.
 */
export function isUneditableOperationsValue(
	permission: LocalRolePermission | undefined,
	allowlistSupported: boolean,
): boolean {
	const kind = classifyOperationsValue(permission, allowlistSupported);
	return kind === 'malformed' || kind === 'database-collision';
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
