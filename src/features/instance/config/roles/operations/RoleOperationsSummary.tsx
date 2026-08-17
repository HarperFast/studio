import {
	expandEffectiveOperations,
	summarizeOperations,
} from '@/features/instance/config/roles/operations/operationsCatalog';
import { LocalRole } from '@/integrations/api/api.patch';
import { getOperationsAllowlist, hasMalformedOperations, isElevatedRole } from '@/integrations/api/localRolePermission';
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
	if (isElevatedRole(permission)) {
		return (
			<p className="text-xs text-warning">
				This role lists an operations allowlist, but it is a super, structure, or cluster user — Harper grants that
				access before the allowlist is checked, so the list has no effect.
			</p>
		);
	}
	const effective = expandEffectiveOperations(getOperationsAllowlist(permission) ?? []);
	if (effective.length === 0) {
		return (
			<p className="text-xs text-destructive">
				This role's operations allowlist is empty — users with it cannot run any operation.
			</p>
		);
	}
	return (
		<p className="text-xs text-muted-foreground" title={summarizeOperations(effective)}>
			This role is restricted to {pluralize(effective.length, 'operation', 'operations')}
			: <span className="font-mono">{effective.slice(0, 5).join(', ')}</span>
			{effective.length > 5 ? ', …' : ''}
		</p>
	);
}
