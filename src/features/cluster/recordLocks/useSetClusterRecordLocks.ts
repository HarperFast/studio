import { apiClient } from '@/config/apiClient';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';
import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { rememberSave } from './pendingRecordLocksSaves';

interface Params {
	clusterId: string;
	organizationId: string;
	recordLocks: boolean;
	skipGtmWait?: boolean;
}

interface SetRecordLocksResponse {
	id: string;
	recordLocks: boolean;
	instancesUpdated?: string[];
}

/**
 * Sends `recordLocks` on its own, as central manager requires: it answers 400 when any other cluster
 * setting rides along, `skipGtmWait` excepted. Sending the value the cluster already has resumes a roll
 * that stopped part way.
 */
async function setClusterRecordLocks(clusterId: string, recordLocks: boolean, skipGtmWait = false) {
	const body = skipGtmWait ? { recordLocks, skipGtmWait } : { recordLocks };
	const { data } = await apiClient.put(`/Cluster/${clusterId}` as '/Cluster/{id}', body);
	return data as unknown as SetRecordLocksResponse;
}

const SET_RECORD_LOCKS_KEY = ['setClusterRecordLocks'] as const;

/**
 * The value a save still out for this cluster is setting, or `undefined` when none is. A page opened again
 * while its PUT is still out has a fresh mutation, so it asks the cache instead.
 */
export function useRecordLocksBeingSet(clusterId: string): boolean | undefined {
	const targets = useMutationState({
		filters: {
			mutationKey: SET_RECORD_LOCKS_KEY,
			status: 'pending',
			predicate: (mutation) => (mutation.state.variables as Params | undefined)?.clusterId === clusterId,
		},
		select: (mutation) => (mutation.state.variables as Params).recordLocks,
	});
	return targets.at(-1);
}

export function useSetClusterRecordLocks() {
	const queryClient = useQueryClient();
	return useMutation<SetRecordLocksResponse, Error, Params>({
		mutationKey: SET_RECORD_LOCKS_KEY,
		mutationFn: ({ clusterId, recordLocks, skipGtmWait }) => setClusterRecordLocks(clusterId, recordLocks, skipGtmWait),
		// The page shows central manager's refusal beside the control, so the fading toast is off.
		// Reported here rather than in a caller's `onError`, which React Query skips once the page unmounts.
		meta: { skipGlobalErrorToast: true },
		onError: (error, { clusterId, recordLocks }) => {
			console.error(error);
			// It may have landed. If so, its roll is about to start, and the gap must not read as a stopped
			// roll; if not, the first read requested since releases it once the grace is over.
			if (isUnansweredWrite(error)) {
				rememberSave(clusterId, recordLocks);
			}
		},
		onSuccess: (_data, { clusterId, recordLocks }) => rememberSave(clusterId, recordLocks),
		onSettled: (_data, _error, { clusterId, organizationId }) => {
			void queryClient.invalidateQueries({ queryKey: getClusterInfoQueryOptions(clusterId).queryKey, exact: true });
			void queryClient.invalidateQueries({ queryKey: [organizationId] });
		},
	});
}
