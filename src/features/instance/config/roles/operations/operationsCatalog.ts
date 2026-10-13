import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';

/**
 * Static catalog of the operation names a role's `permission.operations` allowlist accepts,
 * extracted from the Harper source (`utility/hdbTerms.ts` OPERATIONS_ENUM +
 * `utility/operationPermissions.ts` groups, verified against tags v5.0.0/v5.1.0/v5.2.2/v5.3.0).
 * Harper has no discovery operation for these names (HarperFast/studio#1627), so the UI ships
 * the list per supported version and tolerates unknown names (e.g. component-registered
 * operations on 5.2+) rather than dropping them.
 *
 * Semantics (two-gate check in Harper's `utility/operation_authorization.ts`):
 * - `operations` absent: no operation-level restriction (current behavior).
 * - `operations` present: ONLY listed operations (and group expansions) are reachable. An empty
 *   array denies every operation.
 * - A listed operation that normally requires super_user is treated as a deliberate admin grant
 *   and allowed without super_user (`su` below marks those).
 * - super_user cannot hold a list: validateNoSUPerms rejects a permission that sets
 *   super_user/cluster_user alongside other keys.
 * - Before 5.3 the gate runs after verifyPerms' super_user and structure_user returns, so a
 *   structure user's DDL skips it, and `sql` never reaches it. From 5.3.0-alpha.1 it runs first and
 *   on the SQL path too (see `GrantBand`).
 */
export interface GrantableOperation {
	name: string;
	/** Normally requires super_user; listing it delegates that operation to the role. */
	su: boolean;
	/** Editorial grouping for the picker; not a Harper concept. */
	category: string;
	/** Minimum Harper version exposing the operation. Absent = available since 5.0.0. */
	addedIn?: string;
	/**
	 * The handler self-enforces super_user, so the allowlist cannot delegate it
	 * (secrets store, managed backups, get_deployment_payload, OIDC trust policies). Not offered in the
	 * picker.
	 */
	nonDelegable?: boolean;
	/** Legacy wire alias; Harper's authorization entry is registered under the canonical name. */
	aliasOf?: string;
	/** The band in which it is authorized on a path that never consults the list. */
	outOfGate?: GrantBand;
	/** Why the list does not govern it, shown on its chip wherever `outOfGate` applies. */
	caveat?: string;
	/** Where listing the name stops or starts matching the gate; absent = it matches on every 5.x. */
	gate?: GateChange;
}

/**
 * Gate 1 checks a listed name against the authorization entry's `api_name`. Before 5.3.0-beta.3 that
 * fell back to the handler's own name when the entry had none, which no snake_case grant can equal
 * (HarperFast/harper#2175); beta.3 names every entry, deliberately naming a few `null`. "5.3" below
 * means the `5.3` band:
 * - `from-5.3`: unnamed before 5.3, so listing it grants nothing there.
 * - `until-5.3`: registered under its wire name, so the fallback matched it; named `null` from 5.3.
 * - `never`: no version lets a listing reach it, so it is not offered.
 */
export type GateChange = 'from-5.3' | 'until-5.3' | 'never';

/**
 * Which allowlist rules an instance follows; resolve it once per version, not per operation. Harper
 * changed gate 1 twice during 5.3, so the bands are named for those changes, not for releases:
 * - `pre-5.3`: the gate runs after the super_user and structure_user returns, and the SQL path never
 *   calls it.
 * - `5.3-early` (5.3.0-alpha.1 to beta.2): it runs ahead of both and on the SQL path, but the
 *   entries `from-5.3` marks are still unnamed.
 * - `5.3` (5.3.0-beta.3 on): every entry names its grant as well.
 */
export type GrantBand = 'pre-5.3' | '5.3-early' | '5.3';

/** The first tagged build that runs gate 1 first and on `sql` (harper f8a5aa90a). */
const ALLOWLIST_GATE_RUNS_FIRST_FROM = '5.3.0-alpha.1';

/** The first tagged build that names every authorization entry, not 5.3.0's earliest prerelease. */
export const GATE_NAMES_EVERY_ENTRY_FROM = '5.3.0-beta.3';

export function resolveGrantBand(version: string): GrantBand {
	if (wasAReleasedBeforeB(GATE_NAMES_EVERY_ENTRY_FROM, version)) {
		return '5.3';
	}
	return wasAReleasedBeforeB(ALLOWLIST_GATE_RUNS_FIRST_FROM, version) ? '5.3-early' : 'pre-5.3';
}

/** Whether a structure user's DDL and `sql` have to be listed too, rather than skipping the list. */
export function allowlistGatesEveryPath(band: GrantBand): boolean {
	return band !== 'pre-5.3';
}

export function isOutOfGate(name: string, band: GrantBand): boolean {
	return catalogByName.get(name)?.outOfGate === band;
}

export type GateVerdict = 'grants' | 'needs-5.3' | 'never';

/** Whether gate 1 matches a listing of this name. Unknown names are not judged. */
export function gateVerdict(name: string, band: GrantBand): GateVerdict {
	switch (catalogByName.get(name)?.gate) {
		case 'from-5.3':
			return band === '5.3' ? 'grants' : 'needs-5.3';
		case 'until-5.3':
			return band === '5.3' ? 'never' : 'grants';
		case 'never':
			return 'never';
		default:
			return 'grants';
	}
}

/**
 * Whether listing this name changes nothing: an alias the gate resolves elsewhere, an operation
 * whose handler self-enforces super_user, one the gate cannot match, or one this band authorizes
 * on its own path. The chip and the effective count must agree on this, or the same component
 * credits access it also calls inert.
 */
export function isInertGrant(name: string, band: GrantBand): boolean {
	const info = catalogByName.get(name);
	return !!info?.aliasOf || !!info?.nonDelegable || isOutOfGate(name, band) || gateVerdict(name, band) !== 'grants';
}

export interface OperationGroup {
	name: string;
	description: string;
	/** Individual operations the server expands this group into. */
	members: readonly string[];
	/** Minimum Harper version that accepts the group name. Absent = available since 5.0.0. */
	addedIn?: string;
}

/**
 * `permission.operations` is accepted by add_role/alter_role from v5.0.0-alpha.8 — the first tagged
 * build carrying both the authorization gate and the role validation. Earlier 5.0 prereleases would
 * take the key and fail the save, so the floor is the feature's own release rather than 5.0's.
 */
export const OPERATIONS_ALLOWLIST_MIN_VERSION = '5.0.0-alpha.8';

// Floors use the earliest prerelease so alpha/beta builds of a release pass the gate.
const V5_1 = '5.1.0-alpha.1';
const V5_2 = '5.2.0-alpha.1';
const V5_3 = '5.3.0-alpha.1';

const DATA = 'Data';
const SCHEMA = 'Schema';
const USERS_ROLES = 'Users & Roles';
const COMPONENTS = 'Components & Deployments';
const CLUSTERING = 'Clustering & Replication';
const JOBS = 'Jobs';
const LOGS_ANALYTICS = 'Logs & Analytics';
const SYSTEM = 'System';
const BACKUPS = 'Managed Backups';
const SECRETS_ENV = 'Secrets & Environment';
const AGENT = 'Agent';

/** Category display order for the picker. */
export const OPERATION_CATEGORIES = [
	DATA,
	SCHEMA,
	USERS_ROLES,
	COMPONENTS,
	CLUSTERING,
	JOBS,
	LOGS_ANALYTICS,
	SYSTEM,
	BACKUPS,
	SECRETS_ENV,
	AGENT,
];

/**
 * Every grantable operation name, including non-delegable ones (kept so existing role JSON that
 * names them can still be rendered). Deliberately excludes `login`, `logout`,
 * `create_authentication_tokens`, and `exchange_oidc_token`: those bypass permission checks entirely,
 * so listing them in an allowlist has no effect either way.
 */
export const OPERATION_CATALOG: readonly GrantableOperation[] = [
	// Data
	{ name: 'search', su: false, category: DATA },
	{ name: 'search_by_conditions', su: false, category: DATA },
	{ name: 'search_by_hash', su: false, category: DATA },
	{ name: 'search_by_id', su: false, category: DATA, aliasOf: 'search_by_hash' },
	{ name: 'search_by_value', su: false, category: DATA },
	{
		name: 'sql',
		su: false,
		category: DATA,
		// Before 5.3 serverUtilities sends `sql` straight to checkASTPermissions, which never consults the
		// allowlist. From 5.3.0-alpha.1 it runs gate 1 on `sql` first, so it is a grant like any other.
		outOfGate: 'pre-5.3',
		caveat: "This instance's Harper authorizes SQL against table permissions only, so listing or omitting "
			+ 'sql here changes nothing. Harper 5.3 and later gate it by this list as well.',
	},
	{ name: 'insert', su: false, category: DATA },
	{ name: 'update', su: false, category: DATA },
	{ name: 'upsert', su: false, category: DATA },
	// Create-or-replace, added by HarperFast/harper#2347. Requires insert + update, the same grants
	// as `upsert`, because it both creates and replaces.
	//
	// Floored at the earliest 5.3 prerelease per this file's convention, which deliberately differs
	// from `PUT_OPERATION_MIN_VERSION` (final 5.3.0) in `putTableRecords.ts`. The two gates fail in
	// opposite directions: offering an unusable grant here is an inert catalog entry, while accepting
	// an alpha that predates the merge there would send an `update` that reports success and silently
	// keeps the attribute — the bug being fixed. Each gate takes the safe side of its own failure.
	{ name: 'put', su: false, category: DATA, addedIn: V5_3 },
	{ name: 'delete', su: false, category: DATA },
	{ name: 'delete_records_before', su: true, category: DATA, aliasOf: 'delete_files_before' },
	{ name: 'csv_data_load', su: false, category: DATA },
	{ name: 'csv_file_load', su: false, category: DATA },
	{ name: 'csv_url_load', su: false, category: DATA },
	{ name: 'import_from_s3', su: false, category: DATA },
	{ name: 'export_local', su: true, category: DATA },
	{ name: 'export_to_s3', su: true, category: DATA },
	// Schema
	{ name: 'describe_all', su: false, category: SCHEMA },
	{ name: 'describe_database', su: false, category: SCHEMA, aliasOf: 'describe_schema' },
	{ name: 'describe_schema', su: false, category: SCHEMA },
	{ name: 'describe_table', su: false, category: SCHEMA },
	{ name: 'create_database', su: true, category: SCHEMA },
	{ name: 'create_schema', su: true, category: SCHEMA, aliasOf: 'create_database' },
	{ name: 'drop_database', su: true, category: SCHEMA },
	{ name: 'drop_schema', su: true, category: SCHEMA, aliasOf: 'drop_database' },
	{ name: 'create_table', su: true, category: SCHEMA },
	{ name: 'drop_table', su: true, category: SCHEMA },
	{ name: 'create_attribute', su: false, category: SCHEMA },
	{ name: 'drop_attribute', su: true, category: SCHEMA },
	{ name: 'cleanup_orphan_blobs', su: true, category: SCHEMA, gate: 'from-5.3' },
	// Users & Roles
	{ name: 'user_info', su: false, category: USERS_ROLES },
	{ name: 'list_users', su: true, category: USERS_ROLES },
	{ name: 'add_user', su: true, category: USERS_ROLES },
	{ name: 'alter_user', su: true, category: USERS_ROLES },
	{ name: 'drop_user', su: true, category: USERS_ROLES },
	{ name: 'list_roles', su: true, category: USERS_ROLES },
	{ name: 'add_role', su: true, category: USERS_ROLES },
	{ name: 'alter_role', su: true, category: USERS_ROLES },
	{ name: 'drop_role', su: true, category: USERS_ROLES },
	{ name: 'refresh_operation_token', su: false, category: USERS_ROLES },
	{ name: 'add_oidc_trust', su: true, category: USERS_ROLES, addedIn: V5_3, nonDelegable: true },
	{ name: 'list_oidc_trust', su: true, category: USERS_ROLES, addedIn: V5_3, nonDelegable: true },
	{ name: 'drop_oidc_trust', su: true, category: USERS_ROLES, addedIn: V5_3, nonDelegable: true },
	// Components & Deployments
	{ name: 'get_components', su: true, category: COMPONENTS },
	{ name: 'get_component_file', su: true, category: COMPONENTS },
	{ name: 'set_component_file', su: true, category: COMPONENTS, gate: 'from-5.3' },
	{ name: 'add_component', su: true, category: COMPONENTS, gate: 'from-5.3' },
	{ name: 'drop_component', su: true, category: COMPONENTS, gate: 'from-5.3' },
	{ name: 'deploy_component', su: true, category: COMPONENTS, gate: 'from-5.3' },
	{ name: 'package_component', su: true, category: COMPONENTS, gate: 'from-5.3' },
	{ name: 'install_node_modules', su: true, category: COMPONENTS, gate: 'from-5.3' },
	{ name: 'audit_node_modules', su: true, category: COMPONENTS },
	{ name: 'custom_functions_status', su: true, category: COMPONENTS },
	{ name: 'get_custom_functions', su: true, category: COMPONENTS },
	{ name: 'get_custom_function', su: true, category: COMPONENTS },
	{ name: 'set_custom_function', su: true, category: COMPONENTS, gate: 'from-5.3' },
	{ name: 'drop_custom_function', su: true, category: COMPONENTS, gate: 'from-5.3' },
	{ name: 'add_custom_function_project', su: true, category: COMPONENTS, aliasOf: 'add_component' },
	{ name: 'deploy_custom_function_project', su: true, category: COMPONENTS, aliasOf: 'deploy_component' },
	{ name: 'package_custom_function_project', su: true, category: COMPONENTS, aliasOf: 'package_component' },
	{ name: 'drop_custom_function_project', su: true, category: COMPONENTS, gate: 'from-5.3' },
	{ name: 'list_deployments', su: true, category: COMPONENTS, addedIn: V5_1 },
	{ name: 'get_deployment', su: true, category: COMPONENTS, addedIn: V5_1 },
	{ name: 'get_deployment_payload', su: true, category: COMPONENTS, addedIn: V5_1, nonDelegable: true },
	{ name: 'delete_deployment_payload', su: true, category: COMPONENTS, addedIn: V5_1 },
	// Clustering & Replication
	{ name: 'add_node', su: true, category: CLUSTERING },
	{ name: 'update_node', su: true, category: CLUSTERING },
	{ name: 'set_node_replication', su: true, category: CLUSTERING },
	{ name: 'purge_stream', su: true, category: CLUSTERING },
	{ name: 'catchup', su: true, category: CLUSTERING, gate: 'until-5.3' },
	// Jobs
	{ name: 'get_job', su: false, category: JOBS },
	{ name: 'search_jobs_by_start_date', su: true, category: JOBS, gate: 'from-5.3' },
	{ name: 'update_job', su: true, category: JOBS },
	{ name: 'delete_job', su: true, category: JOBS },
	// Logs & Analytics
	{ name: 'read_log', su: true, category: LOGS_ANALYTICS },
	{ name: 'read_audit_log', su: true, category: LOGS_ANALYTICS },
	{ name: 'read_transaction_log', su: true, category: LOGS_ANALYTICS, gate: 'never' },
	{ name: 'delete_files_before', su: true, category: LOGS_ANALYTICS, gate: 'from-5.3' },
	{ name: 'delete_audit_logs_before', su: true, category: LOGS_ANALYTICS, gate: 'from-5.3' },
	{ name: 'delete_transaction_logs_before', su: true, category: LOGS_ANALYTICS, gate: 'from-5.3' },
	{ name: 'get_analytics', su: false, category: LOGS_ANALYTICS },
	{ name: 'list_metrics', su: false, category: LOGS_ANALYTICS },
	{ name: 'describe_metric', su: false, category: LOGS_ANALYTICS },
	// System
	{ name: 'get_configuration', su: true, category: SYSTEM },
	{ name: 'set_configuration', su: true, category: SYSTEM, gate: 'from-5.3' },
	{ name: 'restart', su: true, category: SYSTEM },
	{ name: 'restart_service', su: true, category: SYSTEM, gate: 'from-5.3' },
	{ name: 'system_information', su: true, category: SYSTEM },
	{ name: 'get_status', su: true, category: SYSTEM, gate: 'from-5.3' },
	{ name: 'set_status', su: true, category: SYSTEM, gate: 'from-5.3' },
	{ name: 'clear_status', su: true, category: SYSTEM, gate: 'from-5.3' },
	{ name: 'registration_info', su: false, category: SYSTEM, gate: 'from-5.3' },
	{ name: 'get_backup', su: true, category: SYSTEM, gate: 'never' },
	// Managed Backups (5.2+, handlers self-enforce super_user)
	{ name: 'create_backup', su: true, category: BACKUPS, addedIn: V5_2, nonDelegable: true },
	{ name: 'verify_backup', su: true, category: BACKUPS, addedIn: V5_2, nonDelegable: true },
	{ name: 'restore_backup', su: true, category: BACKUPS, addedIn: V5_2, nonDelegable: true },
	{ name: 'list_backups', su: true, category: BACKUPS, addedIn: V5_2, nonDelegable: true },
	{ name: 'delete_backup', su: true, category: BACKUPS, addedIn: V5_2, nonDelegable: true },
	{ name: 'purge_backups', su: true, category: BACKUPS, addedIn: V5_2, nonDelegable: true },
	// Secrets & Environment (5.2+; secrets handlers self-enforce super_user, env ones do not)
	{ name: 'set_secret', su: true, category: SECRETS_ENV, addedIn: V5_2, nonDelegable: true },
	{ name: 'grant_secret', su: true, category: SECRETS_ENV, addedIn: V5_2, nonDelegable: true },
	{ name: 'revoke_secret', su: true, category: SECRETS_ENV, addedIn: V5_2, nonDelegable: true },
	{ name: 'list_secrets', su: true, category: SECRETS_ENV, addedIn: V5_2, nonDelegable: true },
	{ name: 'delete_secret', su: true, category: SECRETS_ENV, addedIn: V5_2, nonDelegable: true },
	{ name: 'get_secrets_public_key', su: true, category: SECRETS_ENV, addedIn: V5_2, nonDelegable: true },
	{ name: 'set_env_value', su: true, category: SECRETS_ENV, addedIn: V5_2 },
	{ name: 'delete_env_value', su: true, category: SECRETS_ENV, addedIn: V5_2 },
	{ name: 'get_env_keys', su: true, category: SECRETS_ENV, addedIn: V5_2 },
	// Agent (operations exist from 5.1; all super_user unless delegated)
	{ name: 'agent_prompt', su: true, category: AGENT, addedIn: V5_1 },
	{ name: 'get_agent_session', su: true, category: AGENT, addedIn: V5_1 },
	{ name: 'list_agent_sessions', su: true, category: AGENT, addedIn: V5_1 },
	{ name: 'cancel_agent_run', su: true, category: AGENT, addedIn: V5_1 },
	{ name: 'approve_agent_action', su: true, category: AGENT, addedIn: V5_1 },
	{ name: 'set_agent_config', su: true, category: AGENT, addedIn: V5_1 },
];

const READ_ONLY_MEMBERS = [
	'search',
	'search_by_conditions',
	'search_by_hash',
	'search_by_id',
	'search_by_value',
	'sql',
	'describe_all',
	'describe_schema',
	'describe_database',
	'describe_table',
	'user_info',
	'get_job',
	'get_analytics',
	'list_metrics',
	'describe_metric',
];

/** Predefined group names the server expands; usable in `operations` alongside operation names. */
export const OPERATION_GROUPS: readonly OperationGroup[] = [
	{
		name: 'read_only',
		description: 'Read-only data access: searches, SQL, schema describes, and user/analytics reads.',
		members: READ_ONLY_MEMBERS,
	},
	{
		name: 'admin_read',
		description: 'Read-only access to configuration, logs, and component views (normally super_user-only).',
		members: [
			'get_configuration',
			'read_log',
			'read_audit_log',
			'get_custom_functions',
			'get_custom_function',
			'get_components',
			'get_component_file',
		],
	},
	{
		name: 'standard_user',
		description: 'Everything in read_only plus data writes and bulk loads. No DDL, user management, or admin reads.',
		members: [
			...READ_ONLY_MEMBERS,
			'insert',
			'update',
			'upsert',
			'put',
			'delete',
			'csv_data_load',
			'csv_file_load',
			'csv_url_load',
			'import_from_s3',
		],
	},
	{
		name: 'agent',
		description: 'Drive the built-in agent: prompts, sessions, and run approvals. Excludes agent configuration.',
		members: ['agent_prompt', 'get_agent_session', 'list_agent_sessions', 'cancel_agent_run', 'approve_agent_action'],
		addedIn: V5_2,
	},
];

const catalogByName = new Map(OPERATION_CATALOG.map((operation) => [operation.name, operation]));
const groupsByName = new Map(OPERATION_GROUPS.map((group) => [group.name, group]));

export function getOperationInfo(name: string): GrantableOperation | undefined {
	return catalogByName.get(name);
}

/** The authorization entry a name resolves to; aliases collapse onto their canonical operation. */
export function canonicalOperationName(name: string): string {
	return catalogByName.get(name)?.aliasOf ?? name;
}

export function isOperationGroupName(name: string): boolean {
	return groupsByName.has(name);
}

/** Whether the instance accepts `permission.operations` at all. */
export function supportsOperationsAllowlist(version: string | undefined): boolean {
	return !!version && wasAReleasedBeforeB(OPERATIONS_ALLOWLIST_MIN_VERSION, version);
}

/**
 * The operations the picker should offer for an instance version: known to the version and
 * delegable. Existing entries outside this list (unknown/custom or non-delegable names) are still
 * rendered and preserved — just not offered.
 */
export function getGrantableOperations(version: string): GrantableOperation[] {
	const band = resolveGrantBand(version);
	return OPERATION_CATALOG.filter(
		(operation) =>
			!operation.nonDelegable
			// Both spellings of an alias pair dispatch to one handler, whose authorization entry
			// carries only the canonical api_name — so granting the alias spelling is inert. Offer
			// the canonical name only; alias entries stay in the catalog to render existing JSON.
			&& !operation.aliasOf
			&& gateVerdict(operation.name, band) !== 'never'
			&& (!operation.addedIn || wasAReleasedBeforeB(operation.addedIn, version)),
	);
}

/** The predefined groups the instance version accepts. */
export function getAvailableGroups(version: string): OperationGroup[] {
	return OPERATION_GROUPS.filter((group) => !group.addedIn || wasAReleasedBeforeB(group.addedIn, version));
}

/**
 * Expands an `operations` array the way the server does: group names become their member
 * operations, everything else (including names we don't recognize) passes through. Sorted and
 * de-duplicated.
 */
export function expandEffectiveOperations(operations: readonly string[], band: GrantBand): string[] {
	const effective = new Set<string>();
	// A group's members fold to their canonical name: Harper's groups list both spellings of a pair
	// (search_by_hash/search_by_id, describe_schema/describe_database) but each pair reaches one
	// handler, so counting both would overstate the role's reach.
	for (const entry of operations) {
		const group = groupsByName.get(entry);
		if (group) {
			for (const member of group.members) {
				const canonical = catalogByName.get(member)?.aliasOf ?? member;
				if (!isInertGrant(canonical, band)) {
					effective.add(canonical);
				}
			}
			continue;
		}
		// A direct entry is NOT folded: the chip beside this count says an alias grants nothing, and
		// rewriting it to its canonical name here would credit the role with access it does not have.
		// Entries the server can never honor are left out for the same reason.
		if (!isInertGrant(entry, band)) {
			effective.add(entry);
		}
	}
	return [...effective].sort();
}

/** Caps a `title` tooltip to a readable length; a hundred comma-joined names helps nobody. */
export function summarizeOperations(effective: readonly string[], limit = 40): string {
	return effective.length > limit
		? `${effective.slice(0, limit).join(', ')}, +${effective.length - limit} more`
		: effective.join(', ');
}
