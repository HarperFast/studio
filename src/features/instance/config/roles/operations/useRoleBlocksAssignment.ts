import { useOperationsAllowlistSupported } from '@/features/instance/config/roles/operations/useOperationsAllowlistSupported';
import { LocalRole } from '@/integrations/api/api.patch';
import { classifyOperationsValue } from '@/integrations/api/localRolePermission';

/**
 * Whether assigning this role would break authentication for the whole instance. Harper expands
 * every assigned role's allowlist during the user-cache load, so a value it cannot iterate rejects
 * that load and no user can authenticate afterwards — which makes assignment the trigger, and this
 * the one place the UI can still prevent it.
 *
 * `false` while the instance version is unresolved: the classification is unknowable then, and
 * blocking every assignment on a slow query would be worse than the window it closes.
 */
export function useRoleBlocksAssignment(role: LocalRole | undefined): boolean {
	const allowlistSupported = useOperationsAllowlistSupported();
	if (role === undefined || allowlistSupported === undefined) {
		return false;
	}
	return classifyOperationsValue(role.permission, allowlistSupported) === 'breaks-auth';
}
