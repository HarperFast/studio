import { apiClient } from '@/config/apiClient';
import type { paths } from '@/integrations/api/api.gen';
import { AdminExpiryPolicies } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

/** Served by central-manager but not in the generated spec; shape declared in api.patch.d.ts. */
const EXPIRY_POLICY_PATH = '/Admin/ExpiryPolicy/' as unknown as keyof paths;

/**
 * GET /Admin/ExpiryPolicy → the expiry policy tables, so the grants page can say what a policy
 * name on a grant actually schedules. Requires `grant:read`, like the grants themselves.
 */
export async function getExpiryPolicies(): Promise<AdminExpiryPolicies> {
	const { data } = await apiClient.get(EXPIRY_POLICY_PATH);
	return data as unknown as AdminExpiryPolicies;
}

export function getExpiryPoliciesQueryOptions() {
	return queryOptions({
		queryKey: ['fabric-admin', 'expiry-policies'],
		queryFn: getExpiryPolicies,
		retry: false,
		// The tables are code; they change when central-manager deploys, not between clicks.
		staleTime: Infinity,
	});
}
