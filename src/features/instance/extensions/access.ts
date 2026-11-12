import type { ExtensionDataSource } from '@/features/instance/extensions/dataSource';
import { HARPER_OPERATIONS } from '@/features/instance/extensions/harperOperations';
import type { ExtensionAccess, ExtensionRequest } from '@/features/instance/extensions/manifest';
import { checkAnyOperationAllowed, checkTableOperationsAllowed } from '@/hooks/checkOperationPermission';
import { checkSchemaTablePermission, checkTableGrant } from '@/hooks/checkSchemaTablePermission';
import type { LocalRolePermission, LocalRolePermissionAction } from '@/integrations/api/api.patch';
import { getOperationsAllowlist } from '@/integrations/api/localRolePermission';

export interface AccessVerdict {
	allowed: boolean;
	/** What the role lacks, in words for the "not available to your role" state. Empty when allowed. */
	missing: string[];
	/**
	 * Set when no role can see the page, because Studio can't read its access or it names an operation no
	 * page may send. Then the page itself is the problem, not the viewer's role.
	 */
	problem?: string;
}

/** Why no role sees a page whose declaration is unreadable or refused, or undefined when it is neither. */
function describeUnusableAccess(access: ExtensionAccess | undefined): string | undefined {
	if (access?.refused?.length) {
		const names = access.refused.join(', ');
		return `It lists ${names}, ${
			access.refused.length === 1 ? "one of Harper's own operations" : "Harper's own operations"
		}, which a page can't send.`;
	}
	if (access?.unreadable?.length) {
		return `Studio can't read its ${access.unreadable.join(', ')}. It may need a newer Studio.`;
	}
	return undefined;
}

/**
 * Whether a role meets a page's declared access. Built on the same checks the built-in pages use, so a
 * page is offered exactly when the requests it declares would pass the server's gates. A missing
 * permission (still loading) denies, like every instance permission hook, and access the parser couldn't
 * fully read denies every role, super users included.
 */
export function checkExtensionAccess(
	permission: LocalRolePermission | undefined,
	access: ExtensionAccess | undefined,
): AccessVerdict {
	const problem = describeUnusableAccess(access);
	if (problem) {
		return { allowed: false, missing: [], problem };
	}
	if (!permission) {
		return { allowed: false, missing: ['a signed-in role'] };
	}
	const missing: string[] = [];
	const superUser = permission.super_user === true;

	if (access?.role === 'super_user' && !superUser) {
		missing.push('super user');
	}
	if (access?.role === 'structure_user' && !superUser && !permission.structure_user) {
		missing.push('super user or structure user');
	}
	for (const grant of access?.tables ?? []) {
		const absent = grant.actions.filter((action) =>
			!checkSchemaTablePermission(permission, grant.database, grant.table, action)
		);
		if (absent.length) {
			missing.push(`${absent.join('/')} on ${grant.database}.${grant.table}`);
		}
	}
	for (const operation of access?.operations ?? []) {
		if (!checkExtraOperationAllowed(permission, operation)) {
			missing.push(`the ${operation} operation`);
		}
	}
	return { allowed: missing.length === 0, missing };
}

/**
 * Operations beyond table DML are super_user operations, which a non-super role holds only when its
 * allowlist names them (gate 2). So unlike the DML checks, an absent allowlist denies here.
 */
function checkExtraOperationAllowed(permission: LocalRolePermission, operation: string): boolean {
	return permission.super_user === true
		|| (getOperationsAllowlist(permission) !== undefined && checkAnyOperationAllowed(permission, [operation]));
}

/**
 * Whether the page lists `action` on this table in `access.tables` or `access.optional.tables`. Access it
 * couldn't read, or that it refused, declares nothing.
 */
export function isDeclared(
	access: ExtensionAccess | undefined,
	database: string,
	table: string,
	action: LocalRolePermissionAction,
): boolean {
	return !describeUnusableAccess(access)
		&& [...(access?.tables ?? []), ...(access?.optional?.tables ?? [])].some((grant) =>
			grant.database === database && grant.table === table && grant.actions.includes(action)
		);
}

const UNDECLARED_VERBS: Record<LocalRolePermissionAction, string> = {
	read: 'reads',
	insert: 'inserts into',
	update: 'updates',
	delete: 'deletes from',
};

/** Why Studio won't send a section's request, for the state drawn in its place. */
export function describeUndeclared(database: string, table: string, action: LocalRolePermissionAction): string {
	return `It ${UNDECLARED_VERBS[action]} ${database}.${table}, which this page doesn't declare.`;
}

export type TableCapabilities = Record<LocalRolePermissionAction, boolean>;

/** What a section may do to one table: what its page declares, and only as far as the role allows. */
export function getTableCapabilities(
	permission: LocalRolePermission | undefined,
	access: ExtensionAccess | undefined,
	database: string,
	table: string,
): TableCapabilities {
	const can = (action: LocalRolePermissionAction) =>
		isDeclared(access, database, table, action) && checkSchemaTablePermission(permission, database, table, action);
	return { read: can('read'), insert: can('insert'), update: can('update'), delete: can('delete') };
}

// Only operations whose `database` and `table` fields are everything they touch, with every grant Harper
// asks for (utility/operation_authorization.ts:165-205; upsert needs both insert and update). `sql` and
// `search` are not: each carries a statement that names its own tables. `put` is left out too, since a
// full replace drops the attributes a request omits.
const DML_OPERATION_ACTIONS = new Map<string, readonly LocalRolePermissionAction[]>([
	['search_by_conditions', ['read']],
	['search_by_hash', ['read']],
	['search_by_id', ['read']],
	['search_by_value', ['read']],
	['insert', ['insert']],
	['update', ['update']],
	['upsert', ['insert', 'update']],
	['delete', ['delete']],
]);

/** Whether an operation writes to the one table its request names, so its confirmation can say where. */
export function isTableWrite(operation: string): boolean {
	return DML_OPERATION_ACTIONS.get(operation)?.some((action) => action !== 'read') ?? false;
}

/**
 * Top-level request keys Harper reads as the request's envelope rather than its content, so a page could
 * use them to change who a request runs as, where it replicates, or how long a record lives. Harper's own
 * list of these control fields is config/configUtils.ts:1592; line numbers are at harper 79aec74f9.
 */
const ENVELOPE_KEYS = [
	// Runs the request as another user or role (server/serverHelpers/serverHandlers.ts:162-164).
	'impersonate',
	// The caller every handler reads (dataLayer/harperBridge/ResourceBridge.ts:280). Harper overwrites it on
	// the HTTP path (serverHandlers.ts:161, 174), so this guards the paths that don't.
	'hdb_user',
	// The caller's credentials in both spellings (server/operationsServer.ts:150, configUtils.ts:1589-1592).
	'hdbAuthHeader',
	'hdb_auth_header',
	// Authorization bypass, which Harper strips from every body (serverHandlers.ts:204-205).
	'bypass_auth',
	'bypassAuth',
	// Which nodes a write goes to, and whether it waits for them (ResourceBridge.ts:284-285, 358-359).
	'replicateTo',
	'replicatedConfirmation',
	// `false` keeps an operation on this node, `true` fans it out (ResourceBridge.ts:198, configUtils.ts:1592).
	'replicated',
	// When the written records expire (ResourceBridge.ts:281).
	'expiresAt',
];

/** The database a table request targets, or undefined when its `database` and `schema` disagree. */
function requestDatabase(request: Record<string, unknown>): string | undefined {
	const { database = request.schema ?? 'data', schema = database } = request;
	return typeof database === 'string' && schema === database ? database : undefined;
}

/**
 * Whether Studio may send an action's request. It can reach only what its page declared (the tables and
 * actions in `access.tables`, the component operations it lists), never one of Harper's own operations
 * beyond that table DML or a key from the request's envelope, and only what the viewer's role allows, so
 * a careless manifest cannot use Studio as a confused deputy for the rest of the cluster.
 */
export function checkPageRequest(
	permission: LocalRolePermission | undefined,
	access: ExtensionAccess | undefined,
	request: ExtensionRequest,
): { allowed: true } | { allowed: false; reason: string } {
	const problem = describeUnusableAccess(access);
	if (problem) {
		return { allowed: false, reason: `Studio won't send requests for this page. ${problem}` };
	}
	const envelope = ENVELOPE_KEYS.find((key) => Object.hasOwn(request, key));
	if (envelope) {
		return { allowed: false, reason: `a page's request can't set ${envelope}` };
	}
	const { operation } = request;
	const actions = DML_OPERATION_ACTIONS.get(operation);
	if (actions) {
		const database = requestDatabase(request);
		if (database === undefined) {
			return { allowed: false, reason: `${operation} names two different databases` };
		}
		const table = typeof request.table === 'string' ? request.table : '';
		if (!actions.every((action) => isDeclared(access, database, table, action))) {
			return { allowed: false, reason: `${operation} on ${database}.${table} is not declared by this page` };
		}
		const denied = actions.filter((action) => !checkTableGrant(permission, database, table, action));
		if (denied.length) {
			return { allowed: false, reason: `your role cannot ${denied.join(' and ')} ${database}.${table}` };
		}
		// The allowlist is checked for the operation sent, as Harper checks it (verifyOperationsAllowlist,
		// utility/operation_authorization.ts:809-825 at harper a0ef126d1), not for the ones each table action
		// stands for elsewhere: an upsert needs an `upsert` entry, and `insert` plus `update` grant it nothing.
		return checkTableOperationsAllowed(permission, [operation])
			? { allowed: true }
			: { allowed: false, reason: `your role cannot run ${operation}` };
	}

	if (HARPER_OPERATIONS.has(operation)) {
		return { allowed: false, reason: `${operation} is one of Harper's own operations, which a page can't send` };
	}
	if (![...(access?.operations ?? []), ...(access?.optional?.operations ?? [])].includes(operation)) {
		return { allowed: false, reason: `the ${operation} operation is not declared by this page` };
	}
	return permission && checkExtraOperationAllowed(permission, operation)
		? { allowed: true }
		: { allowed: false, reason: `your role cannot run ${operation}` };
}

/** What Studio says it will send, above the request itself in an action's confirmation. */
export function describePageRequest(request: ExtensionRequest): string {
	const database = DML_OPERATION_ACTIONS.has(request.operation) ? requestDatabase(request) : undefined;
	return database !== undefined && typeof request.table === 'string'
		? `Studio will send ${request.operation} to ${database}.${request.table}:`
		: `Studio will send the ${request.operation} operation:`;
}

/**
 * The data source a page's sections use: every read and write is checked against the page's declaration
 * before it is sent, and every action against {@link checkPageRequest}. The sections also draw nothing
 * that needs an undeclared request, so this is the backstop. Harper never reads a page's access.
 */
export function declaredDataSource(
	dataSource: ExtensionDataSource,
	permission: LocalRolePermission | undefined,
	access: ExtensionAccess | undefined,
): ExtensionDataSource {
	const require = (database: string, table: string, action: LocalRolePermissionAction) => {
		if (!isDeclared(access, database, table, action)) {
			throw new Error(describeUndeclared(database, table, action));
		}
	};
	return {
		id: dataSource.id,
		list: async (database, table, primaryKey, attributes) => {
			require(database, table, 'read');
			return dataSource.list(database, table, primaryKey, attributes);
		},
		count: async (database, table, where) => {
			require(database, table, 'read');
			return dataSource.count(database, table, where);
		},
		get: async (database, table, primaryKey, id, attributes) => {
			require(database, table, 'read');
			return dataSource.get(database, table, primaryKey, id, attributes);
		},
		insert: async (database, table, record, primaryKey) => {
			require(database, table, 'insert');
			return dataSource.insert(database, table, record, primaryKey);
		},
		update: async (database, table, record, primaryKey) => {
			require(database, table, 'update');
			return dataSource.update(database, table, record, primaryKey);
		},
		remove: async (database, table, id) => {
			require(database, table, 'delete');
			return dataSource.remove(database, table, id);
		},
		send: async (request) => {
			const verdict = checkPageRequest(permission, access, request);
			if (!verdict.allowed) {
				throw new Error(verdict.reason);
			}
			return dataSource.send(request);
		},
	};
}
