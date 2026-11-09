import { apiClient } from '@/config/apiClient';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface Params {
	clusterId: string;
	organizationId: string;
	recordLocks: boolean;
}

/** Central manager's answer: the members it is about to restart, one at a time, in the background. */
export interface SetRecordLocksResponse {
	id: string;
	recordLocks: boolean;
	instancesUpdated?: string[];
}

/**
 * Sends `recordLocks` on its own, as central manager requires: it answers 400 when any other cluster
 * setting rides along. Sending the value the cluster already has resumes a roll that stopped part way.
 */
export async function setClusterRecordLocks(clusterId: string, recordLocks: boolean) {
	// Central manager's OpenAPI describes neither this body nor its answer.
	const { data } = await apiClient.put(`/Cluster/${clusterId}` as '/Cluster/{id}', { recordLocks });
	return data as unknown as SetRecordLocksResponse;
}

export function useSetClusterRecordLocks() {
	const queryClient = useQueryClient();
	return useMutation<SetRecordLocksResponse, Error, Params>({
		mutationFn: ({ clusterId, recordLocks }) => setClusterRecordLocks(clusterId, recordLocks),
		// The page shows central manager's refusal beside the control, so the fading toast is off.
		// Reported here rather than in a caller's `onError`, which React Query skips once the page unmounts.
		meta: { skipGlobalErrorToast: true },
		onError: (error) => console.error(error),
		onSettled: (_data, _error, { clusterId, organizationId }) => {
			void queryClient.invalidateQueries({ queryKey: getClusterInfoQueryOptions(clusterId).queryKey, exact: true });
			void queryClient.invalidateQueries({ queryKey: [organizationId] });
		},
	});
}
