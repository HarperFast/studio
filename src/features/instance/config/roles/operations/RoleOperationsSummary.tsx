import {
	expandEffectiveOperations,
	summarizeOperations,
} from '@/features/instance/config/roles/operations/operationsCatalog';
import { useOperationsAllowlistSupported } from '@/features/instance/config/roles/operations/useOperationsAllowlistSupported';
import { LocalRole } from '@/integrations/api/api.patch';
import {
	classifyOperationsValue,
	getOperationsAllowlist,
	rolePreventsOperationsAllowlist,
	structureUserDdlScope,
} from '@/integrations/api/localRolePermission';
import { pluralize } from '@/lib/pluralize';

/**
 * One-line effective-operations summary for a role carrying an `operations` allowlist, shown
 * where a role is assigned to a user so the restriction isn't a surprise (HarperFast/studio#1627).
 * Renders nothing for unrestricted roles.
 */
export function RoleOperationsSummary({ role }: { role: LocalRole | undefined }) {
	const allowlistSupported = useOperationsAllowlistSupported();
	const permission = role?.permission;
	// While the version is unresolved the verdict is unknowable, so say nothing rather than
	// briefly describe a restricted role as unrestricted.
	if (permission === undefined || allowlistSupported === undefined) {
		return null;
	}
	const kind = classifyOperationsValue(permission, allowlistSupported);
	// `database` is a pre-5.0 role granting a database named `operations` — not a restriction.
	if (kind === 'absent' || kind === 'database') {
		return null;
	}
	if (kind === 'database-collision') {
		// Never advise "fixing" this: Harper still grants these tables, and replacing the record with
		// an array makes permissionsTranslator throw for every request the user makes.
		return (
			<p className="text-xs text-warning">
				This role grants table permissions on a database named{' '}
				<span className="font-mono">operations</span>, which this Harper version reserves for the operations allowlist.
				Those table grants still apply, but the allowlist cannot be managed here — rename the database to use both.
			</p>
		);
	}
	if (kind === 'malformed') {
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
	// Phrased to follow either "…cannot run any operation" or "…restricted to N operations", so the
	// absolute wording is never left standing on a role that still reaches DDL.
	const ddlScope = structureUserDdlScope(permission);
	const ddlNote = ddlScope === true
		? ', except that it is a structure user: table and attribute DDL — and create/drop database — apply on any'
			+ ' database regardless of the list.'
		: ddlScope
		? `, except that it is a structure user: table and attribute DDL applies on ${ddlScope.join(', ')}`
			+ ' regardless of the list, and listing those operations cannot reach another database.'
		: '';
	const effective = expandEffectiveOperations(getOperationsAllowlist(permission) ?? []);
	if (effective.length === 0) {
		return (
			<p className="text-xs text-destructive">
				This role's operations allowlist is empty — users with it cannot run any operation
				{ddlScope ? '' : '.'}
				{ddlNote}
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
