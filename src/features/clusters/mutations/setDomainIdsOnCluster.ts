import { apiClient } from '@/config/apiClient';
import { watchChallengeCertificates } from '@/features/cluster/domains/queries/getChallengeCertificates';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { QueryClient, useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

interface Params {
	clusterId: string;
	domainIds: string[];
	/** Omit to leave the cluster's cert intent as it is: central manager reads an absent flag as
	 *  unchanged, where `false` revokes it. */
	generateDomainCerts?: boolean;
}

async function setDomainIdsOnCluster({ clusterId, domainIds, generateDomainCerts }: Params) {
	// TODO: API does not describe this endpoint permutation
	const { data } = await apiClient.put(`/Cluster/${clusterId}` as '/Cluster/{id}', {
		domainIds,
		generateDomainCerts,
	}, { timeout: 0 });
	return data;
}

const setDomainIdsMutationKey = ['setDomainIdsOnCluster'] as const;

export function useSetDomainIdsOnCluster() {
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationKey: setDomainIdsMutationKey,
		mutationFn: (params: Params) => setDomainIdsOnCluster(params),
		onSuccess: (_data, { clusterId, domainIds }) => {
			// Every change sends the whole list, built from this cache, so it has to hold the list
			// this one left even if the re-read below fails.
			const { queryKey } = getClusterInfoQueryOptions(clusterId);
			queryClient.setQueryData(queryKey, (cluster) => cluster && { ...cluster, domainIds });
			void queryClient.invalidateQueries({ queryKey, exact: true });
			void watchChallengeCertificates(queryClient, clusterId);
		},
	});
	const { mutate } = mutation;
	// `useIsSettingDomainIds` disables the controls only once React re-renders, so a click already
	// queued behind the first change would otherwise build its list from the same stale cache.
	const mutateWhenIdle = useCallback<typeof mutate>((variables, options) => {
		if (!isSettingDomainIds(queryClient)) {
			mutate(variables, options);
		}
	}, [mutate, queryClient]);
	return { ...mutation, mutate: mutateWhenIdle };
}

export function isSettingDomainIds(queryClient: QueryClient): boolean {
	return queryClient.isMutating({ mutationKey: setDomainIdsMutationKey }) > 0;
}

export function useIsSettingDomainIds(): boolean {
	return useIsMutating({ mutationKey: setDomainIdsMutationKey }) > 0;
}
