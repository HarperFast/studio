import {
	canonicalOperationName,
	OPERATION_GROUPS,
} from '@/features/instance/config/roles/operations/operationsCatalog';
import {
	LocalRoleAttributePermissionAction,
	LocalRolePermission,
	LocalRolePermissionAction,
} from '@/integrations/api/api.patch';
import type { ImportSource } from '@/integrations/api/instance/database/importData';
import { getOperationsAllowlist } from '@/integrations/api/localRolePermission';

/**
 * Harper's `operations` allowlist (5.0+) is reached only by roles verifyPerms has not already cleared:
 * `isSuperUser && !isSuSystemOperation` returns first, and `structure_user` returns for create/drop
 * database, table, and attribute. Table reads and writes are the only Studio surface it can deny.
 */

export const TABLE_ACTION_OPERATIONS: Record<LocalRolePermissionAction, readonly string[]> = {
	read: ['search', 'search_by_conditions', 'search_by_hash', 'search_by_value', 'sql'],
	insert: ['insert'],
	update: ['update'],
	delete: ['delete'],
};

/**
 * What each import path issues, as an all-of list. A CSV load returns a job id the client then polls,
 * so `get_job` belongs to those paths: without it a load commits, the poll 403s, and the reported
 * failure invites a duplicating retry.
 */
const RECORDS_PATH = ['insert'];
const CSV_DATA_PATH = ['csv_data_load', 'get_job'];
const CSV_URL_PATH = ['csv_url_load', 'get_job'];

const IMPORT_SOURCE_PATHS: Record<ImportSource['kind'], readonly string[]> = {
	'json-records': RECORDS_PATH,
	'csv-data': CSV_DATA_PATH,
	'csv-url': CSV_URL_PATH,
};

/**
 * The paths each Import Data method can take. `sample` and `file` stay ambiguous until submit — a
 * bundled dataset bulk-loads while random records insert, and a `.json` upload inserts while any other
 * extension bulk-loads — so a method is offered while either path is open, and
 * {@link checkImportSourceAllowed} settles the actual choice.
 */
const IMPORT_METHOD_PATHS = {
	sample: [RECORDS_PATH, CSV_DATA_PATH],
	file: [RECORDS_PATH, CSV_DATA_PATH],
	url: [CSV_URL_PATH],
} satisfies Record<string, readonly (readonly string[])[]>;

export type ImportMethod = keyof typeof IMPORT_METHOD_PATHS;

export const IMPORT_METHODS = Object.keys(IMPORT_METHOD_PATHS) as ImportMethod[];

// Keyed by the allowlist array, not the permission: a role edit yields a new array, so an entry
// cannot go stale.
const expandedAllowlists = new WeakMap<readonly string[], ReadonlySet<string>>();

const groupMembers = new Map(OPERATION_GROUPS.map((group) => [group.name, group.members]));

/**
 * Expands the way `expandOperationsPerms` does — groups to their members, everything else verbatim.
 * Deliberately not `expandEffectiveOperations`, which folds alias spellings together to describe what
 * a role can effectively do; the gate does not fold, so a lone alias grant must stay the dead entry it
 * is server-side. Harper's groups carry both spellings of each pair, so group grants are unaffected.
 */
function expandLikeTheGate(allowlist: readonly string[]): ReadonlySet<string> {
	const allowed = new Set<string>();
	for (const entry of allowlist) {
		const members = groupMembers.get(entry);
		if (members) {
			for (const member of members) {
				allowed.add(member);
			}
		} else {
			allowed.add(entry);
		}
	}
	return allowed;
}

/**
 * Whether the allowlist leaves any of these operations reachable. Absent or malformed restricts
 * nothing — a denial that cannot be proven must not hide UI — and an empty array denies everything,
 * as on the server.
 *
 * Version-blind, like the table-grant lookup beside it: `getOperationsAllowlist` only answers yes to
 * an array of strings, and the shape a pre-5.0 instance puts under that key — a database record from
 * permissionsTranslator — can never be one. Asking the instance version instead would mean a query
 * per check, on a hook whose entityId this module does not receive.
 *
 * Matching mirrors gate 1: groups expand, entries match verbatim, and the checked operation resolves
 * to its canonical api_name. Harper registers `search_by_id` under `search_by_hash`, so granting a
 * legacy alias grants nothing, while a canonical grant covers both spellings.
 */
export function checkAnyOperationAllowed(
	permission: LocalRolePermission | undefined,
	operations: readonly string[],
): boolean {
	const allowlist = getOperationsAllowlist(permission);
	if (!allowlist) {
		return true;
	}
	let allowed = expandedAllowlists.get(allowlist);
	if (!allowed) {
		allowed = expandLikeTheGate(allowlist);
		expandedAllowlists.set(allowlist, allowed);
	}
	return operations.some((operation) => allowed.has(canonicalOperationName(operation)));
}

/**
 * Whether these operations survive gate 1 for a table action.
 *
 * Not `isElevatedRole`: that answers whether the allowlist is unenforceable anywhere for the role,
 * which is what the roles editor warns about. DML is where an elevated-but-not-super role is still
 * gated — `structure_user` short-circuits for DDL alone, and `cluster_user` appears nowhere in
 * operation_authorization.ts.
 */
export function checkTableOperationsAllowed(
	permission: LocalRolePermission | undefined,
	operations: readonly string[],
): boolean {
	return permission?.super_user === true
		|| checkAnyOperationAllowed(permission, operations);
}

export function checkTableActionAllowed(
	permission: LocalRolePermission | undefined,
	action: LocalRolePermissionAction | LocalRoleAttributePermissionAction,
): boolean {
	// The Record type makes an unmapped action a compile error; the fallback keeps an off-type one from
	// reaching `.some()` on undefined.
	return checkTableOperationsAllowed(permission, TABLE_ACTION_OPERATIONS[action] ?? []);
}

function checkPathAllowed(permission: LocalRolePermission | undefined, path: readonly string[]): boolean {
	return path.every((operation) => checkAnyOperationAllowed(permission, [operation]));
}

/** Whether the source the user actually chose can run — the check the submit path owes them. */
export function checkImportSourceAllowed(
	permission: LocalRolePermission | undefined,
	kind: ImportSource['kind'],
): boolean {
	return permission?.super_user === true || checkPathAllowed(permission, IMPORT_SOURCE_PATHS[kind]);
}

/** Whether an import method is worth offering: at least one of its paths is open. */
export function checkImportMethodAllowed(
	permission: LocalRolePermission | undefined,
	method: ImportMethod,
): boolean {
	return permission?.super_user === true
		|| IMPORT_METHOD_PATHS[method].some((path) => checkPathAllowed(permission, path));
}

/** Whether any import method survives — the gate for the launchers. */
export function checkImportDataOperationsAllowed(permission: LocalRolePermission | undefined): boolean {
	return IMPORT_METHODS.some((method) => checkImportMethodAllowed(permission, method));
}
