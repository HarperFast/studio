import { apiClient } from '@/config/apiClient';
import { watchChallengeCertificates } from '@/features/cluster/domains/queries/getChallengeCertificates';
import { getClusterInfo, getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import {
	describeClusterNotChangeable,
	describeUnsendableDomainChange,
	DomainChangeRefusal,
} from '@/features/clusters/mutations/describeDomainChangeRefusal';
import {
	getOrganizationDomains,
	getOrganizationDomainsQueryOptions,
} from '@/features/organization/queries/getOrganizationDomains';
import { unique } from '@/lib/arrays/unique';
import { QueryClient, useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

interface Params {
	clusterId: string;
	organizationId: string;
	add?: string[];
	remove?: string;
	/** Omit to leave the cluster's cert intent as it is: central manager reads an absent flag as
	 *  unchanged, where `false` revokes it. */
	generateDomainCerts?: boolean;
}

export class DomainChangeRefusedError extends Error {
	readonly needsSupport: boolean;

	constructor({ message, needsSupport }: DomainChangeRefusal) {
		super(message);
		this.name = 'DomainChangeRefusedError';
		this.needsSupport = needsSupport;
	}
}

async function setDomainIdsOnCluster(clusterId: string, domainIds: string[], generateDomainCerts?: boolean) {
	// TODO: API does not describe this endpoint permutation
	await apiClient.put(`/Cluster/${clusterId}` as '/Cluster/{id}', {
		domainIds,
		generateDomainCerts,
	}, { timeout: 0 });
}

const setDomainIdsMutationKey = ['setDomainIdsOnCluster'] as const;

export function useSetDomainIdsOnCluster() {
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationKey: setDomainIdsMutationKey,
		mutationFn: async ({ clusterId, organizationId, add = [], remove, generateDomainCerts }: Params) => {
			// The PUT replaces the whole list and central manager unbinds whatever it leaves out, so the
			// list is built from a fresh read, not from what this page last saw: another tab or member
			// may have bound a domain since. Read around the query cache, whose error handler would toast
			// a failed read this mutation already reports and the page already shows.
			const [cluster, domains] = await Promise.all([
				getClusterInfo(clusterId),
				getOrganizationDomains(organizationId),
			]);
			queryClient.setQueryData(getClusterInfoQueryOptions(clusterId).queryKey, cluster);
			queryClient.setQueryData(getOrganizationDomainsQueryOptions(organizationId).queryKey, domains);
			const refusal = describeClusterNotChangeable(cluster)
				?? describeUnsendableDomainChange(cluster, { add, remove }, domains);
			if (refusal) {
				throw new DomainChangeRefusedError(refusal);
			}
			const domainIds = unique((cluster.domainIds ?? []).concat(add)).filter((id) => id !== remove);
			await setDomainIdsOnCluster(clusterId, domainIds, generateDomainCerts);
		},
		// The page shows the failure where the change was made, so the fading toast is off. Reported
		// here rather than in a caller's `onError`, which React Query skips once the page unmounts. A
		// refusal is Studio declining to send, not a failure.
		meta: { skipGlobalErrorToast: true },
		onError: (error) => {
			if (!(error instanceof DomainChangeRefusedError)) {
				console.error(error);
			}
		},
		onSuccess: (_data, { clusterId }) => {
			void queryClient.invalidateQueries({ queryKey: getClusterInfoQueryOptions(clusterId).queryKey, exact: true });
			void watchChallengeCertificates(queryClient, clusterId);
		},
	});
	const { mutate } = mutation;
	// `useIsSettingDomainIds` disables the controls only once React re-renders, so a click already
	// queued behind the first change would otherwise start a second one alongside it.
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
