import { apiClient } from '@/config/apiClient';
import type { paths } from '@/integrations/api/api.gen';
import { useMutation } from '@tanstack/react-query';

export interface SwitchToPaidInput {
	clusterId: string;
	/** The cluster's live grant; central-manager answers 409 if it is not. */
	replaceGrantId: string;
	reason: string;
}

/** The paid grant the conversion minted, and the grant it retired. */
export interface SwitchToPaidResult {
	id: string;
	clusterId: string;
	source: 'purchased';
	replacedGrantId: string;
}

const GRANTS_COLLECTION = '/Admin/ClusterGrant' as unknown as keyof paths;

/**
 * POST /Admin/ClusterGrant with `source: purchased` → runs the customer's own same-plan conversion as
 * staff: the organization's card is checked (402 without one) and charged for the cluster's current
 * plan, and the old grant is retired without stopping the cluster. Needs `grant:write` and `billing:write`.
 */
export async function switchGrantToPaid({ clusterId, replaceGrantId, reason }: SwitchToPaidInput) {
	const { data } = await apiClient.post(GRANTS_COLLECTION, { clusterId, source: 'purchased', replaceGrantId, reason });
	return data as unknown as SwitchToPaidResult;
}

export function useSwitchToPaidMutation() {
	// The edit dialog toasts the failure itself; the global toast would stack a duplicate.
	return useMutation<SwitchToPaidResult, Error, SwitchToPaidInput>({
		mutationFn: switchGrantToPaid,
		meta: { skipGlobalErrorToast: true },
	});
}
