import { gateVerdict, resolveGrantBand } from '@/features/instance/config/roles/operations/operationsCatalog';
import { checkAnyOperationAllowed } from '@/hooks/checkOperationPermission';
import type { LocalRolePermission } from '@/integrations/api/api.patch';
import { SEARCH_JOBS_OPERATION } from '@/integrations/api/instance/status/searchJobs';
import { getOperationsAllowlist } from '@/integrations/api/localRolePermission';

/** Whether a role's operations allowlist lists the operation, which delegates it only on some Harper versions. */
export function listsJobsGrant(permission: LocalRolePermission): boolean {
	return getOperationsAllowlist(permission) !== undefined
		&& checkAnyOperationAllowed(permission, [SEARCH_JOBS_OPERATION]);
}

/**
 * Whether this role may list jobs, or `undefined` while its permission or the instance version is still loading.
 *
 * Harper registers `search_jobs_by_start_date` as super_user-only, and a listing delegates it only where the role
 * editor's gate says it grants: 5.3.0-beta.3 on, where its authorization entry is first named (harper
 * `utility/operation_authorization.ts`, unnamed at v5.2.9:373, named at v5.3.2:433). `version` is `null` when a
 * read failed; the instance route has already loaded it once, so that is a failed refetch, not a refusal, and a
 * listed grant is tried, since a refusal of the jobs request shows as one.
 */
export function canListJobs(
	permission: LocalRolePermission | undefined,
	version: string | null | undefined,
): boolean | undefined {
	if (!permission) {
		return undefined;
	}
	if (permission.super_user === true) {
		return true;
	}
	if (!listsJobsGrant(permission)) {
		return false;
	}
	if (version === undefined) {
		return undefined;
	}
	return version === null || gateVerdict(SEARCH_JOBS_OPERATION, resolveGrantBand(version)) === 'grants';
}
