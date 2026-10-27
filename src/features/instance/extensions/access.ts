import type { ExtensionAccess, ExtensionRequest, ExtensionTableGrant } from '@/features/instance/extensions/manifest';
import { checkAnyOperationAllowed } from '@/hooks/checkOperationPermission';
import { checkSchemaTablePermission } from '@/hooks/checkSchemaTablePermission';
import type { LocalRolePermission, LocalRolePermissionAction } from '@/integrations/api/api.patch';
import { getOperationsAllowlist } from '@/integrations/api/localRolePermission';

export interface AccessVerdict {
	allowed: boolean;
	/** Why not, in words for the "not available" state. Empty when allowed. */
	missing: string[];
}

/**
 * Whether a role meets a page's declared access. Built on the same checks the built-in pages use, so a
 * page is offered exactly when the requests it declares would pass the server's gates. A missing
 * permission (still loading) denies, like every instance permission hook.
 */
export function checkExtensionAccess(
	permission: LocalRolePermission | undefined,
	access: ExtensionAccess | undefined,
): AccessVerdict {
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

export type TableCapabilities = Record<LocalRolePermissionAction, boolean>;

/** What a role may do to one table, for drawing a section's buttons. */
export function getTableCapabilities(
	permission: LocalRolePermission | undefined,
	database: string,
	table: string,
): TableCapabilities {
	return {
		read: checkSchemaTablePermission(permission, database, table, 'read'),
		insert: checkSchemaTablePermission(permission, database, table, 'insert'),
		update: checkSchemaTablePermission(permission, database, table, 'update'),
		delete: checkSchemaTablePermission(permission, database, table, 'delete'),
	};
}

// Only operations whose `database` and `table` fields are everything they touch. `sql` is not one: its
// statement names its own tables, so a page that needs it declares it as an operation.
const DML_OPERATION_ACTION = new Map<string, LocalRolePermissionAction>([
	['search', 'read'],
	['search_by_conditions', 'read'],
	['search_by_hash', 'read'],
	['search_by_id', 'read'],
	['search_by_value', 'read'],
	['insert', 'insert'],
	['update', 'update'],
	['upsert', 'update'],
	['delete', 'delete'],
]);

/** The database a table request targets, or undefined when its `database` and `schema` disagree. */
function requestDatabase(request: Record<string, unknown>): string | undefined {
	const { database = request.schema ?? 'data', schema = database } = request;
	return typeof database === 'string' && schema === database ? database : undefined;
}

/**
 * Whether Studio may send an action button's request. It can reach only what its page declared (the
 * tables and actions in `access.tables`, the listed operations) and only what the viewer's role allows,
 * so a careless manifest cannot use Studio as a confused deputy for the rest of the cluster.
 */
export function checkPageRequest(
	permission: LocalRolePermission | undefined,
	access: ExtensionAccess | undefined,
	request: ExtensionRequest,
): { allowed: true } | { allowed: false; reason: string } {
	const { operation } = request;
	const action = DML_OPERATION_ACTION.get(operation);
	if (action) {
		const database = requestDatabase(request);
		if (database === undefined) {
			return { allowed: false, reason: `${operation} names two different databases` };
		}
		const table = typeof request.table === 'string' ? request.table : '';
		const declared = (access?.tables ?? []).some((grant: ExtensionTableGrant) =>
			grant.database === database && grant.table === table && grant.actions.includes(action)
		);
		if (!declared) {
			return { allowed: false, reason: `${operation} on ${database}.${table} is not declared by this page` };
		}
		return checkSchemaTablePermission(permission, database, table, action)
			? { allowed: true }
			: { allowed: false, reason: `your role cannot ${action} ${database}.${table}` };
	}

	if (!(access?.operations ?? []).includes(operation)) {
		return { allowed: false, reason: `the ${operation} operation is not declared by this page` };
	}
	return permission && checkExtraOperationAllowed(permission, operation)
		? { allowed: true }
		: { allowed: false, reason: `your role cannot run ${operation}` };
}
