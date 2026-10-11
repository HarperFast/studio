import { isGrantGateInert } from '@/features/instance/config/roles/operations/operationsCatalog';
import { checkAnyOperationAllowed } from '@/hooks/checkOperationPermission';
import type { LocalRolePermission } from '@/integrations/api/api.patch';
import { SEARCH_JOBS_OPERATION } from '@/integrations/api/instance/status/searchJobs';
import { getOperationsAllowlist } from '@/integrations/api/localRolePermission';

/**
 * Whether this role may list jobs, or `undefined` while its permission is still loading.
 *
 * Harper registers `search_jobs_by_start_date` as super_user-only (`requiredPermissions` in harper
 * `utility/operation_authorization.ts`). An allowlist naming it is honoured only where the role editor's
 * catalog says the grant is not inert, so the two never disagree about what such a role can do.
 */
export function canListJobs(permission: LocalRolePermission | undefined): boolean | undefined {
	if (!permission) {
		return undefined;
	}
	if (permission.super_user === true) {
		return true;
	}
	return !isGrantGateInert(SEARCH_JOBS_OPERATION)
		&& getOperationsAllowlist(permission) !== undefined
		&& checkAnyOperationAllowed(permission, [SEARCH_JOBS_OPERATION]);
}
