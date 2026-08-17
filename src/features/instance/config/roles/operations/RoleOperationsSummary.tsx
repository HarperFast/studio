import {
	expandEffectiveOperations,
	summarizeOperations,
} from '@/features/instance/config/roles/operations/operationsCatalog';
import { LocalRole } from '@/integrations/api/api.patch';
import {
	getOperationsAllowlist,
	hasMalformedOperations,
	rolePreventsOperationsAllowlist,
	structureUserBypassesDdl,
} from '@/integrations/api/localRolePermission';
import { pluralize } from '@/lib/pluralize';

/**
 * One-line effective-operations summary for a role carrying an `operations` allowlist, shown
 * where a role is assigned to a user so the restriction isn't a surprise (HarperFast/studio#1627).
 * Renders nothing for unrestricted roles.
 */
export function RoleOperationsSummary({ role }: { role: LocalRole | undefined }) {
	const permission = role?.permission;
	if (permission === undefined || permission.operations === undefined) {
		return null;
	}
	if (hasMalformedOperations(permission)) {
		return (
			<p className="text-xs text-destructive">
				This role's <span className="font-mono">operations</span>{' '}
				value is not a list of operation names, so Harper cannot apply it as an allowlist. Fix it in the role editor.
			</p>
		);
	}
	if (rolePreventsOperationsAllowlist(permission)) {
		return (
			<p className="text-xs text-destructive">
				This role sets super_user or cluster_user, which Harper does not allow alongside an operations allowlist — the
				role cannot be saved until one of them is removed.
			</p>
		);
	}
	const ddlNote = structureUserBypassesDdl(permission)
		? ' It is also a structure user, so DDL operations apply regardless of the list.'
		: '';
	const effective = expandEffectiveOperations(getOperationsAllowlist(permission) ?? []);
	if (effective.length === 0) {
		return (
			<p className="text-xs text-destructive">
				This role's operations allowlist is empty — users with it cannot run any operation.
			</p>
		);
	}
	const summary = summarizeOperations(effective);
	return (
		<p className="text-xs text-muted-foreground" title={summary}>
			This role is restricted to {pluralize(effective.length, 'operation', 'operations')}
			: <span className="font-mono">{effective.slice(0, 5).join(', ')}</span>
			{effective.length > 5 ? ', …' : ''}
			{ddlNote}
			{/* title is hover-only, so the truncated names need a path to assistive tech. */}
			{effective.length > 5 && <span className="sr-only">Full list: {summary}</span>}
		</p>
	);
}
