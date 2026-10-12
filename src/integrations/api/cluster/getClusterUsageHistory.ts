import { apiClient } from '@/config/apiClient';
import type { UsageMetricKey, UsageMetrics } from '@/integrations/api/cluster/getClusterUsage';
import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';

// Response of central-manager's GET /Cluster/:id/usage/history (HarperFast/central-manager#941): the
// cluster's ended billing cycles, newest first, built from the blocks each cycle ran on.

export interface PastCycleRegion {
	region: string | null;
	regionIds: string[];
	/** The plans the region's blocks ran in the cycle — more than one when the plan changed in it. */
	planNames: string[];
	/** Storage has no history, so past cycles carry no storage meter. */
	metrics: Omit<UsageMetrics, 'storageBytes'>;
	planUsd: number;
	overageUsd: number;
	cycleUsd: number;
	/** Some amount here is today's plan price: the cycle predates recorded charges, or was never priced. */
	estimated: boolean;
	/** Charged blocks not on an invoice yet. */
	uninvoicedBlockCount: number;
	topUpCount: number;
	topUps: Array<{ createdAt: string | null; usedShare: number; chargeUsd: number }>;
	overageCause: { metric: UsageMetricKey | null; ranOutAt: string | null } | null;
	stripeInvoiceIds: string[];
}

export interface PastCycle {
	startsAt: string | null;
	endsAt: string;
	planUsd: number;
	overageUsd: number;
	cycleUsd: number;
	estimated: boolean;
	uninvoicedBlockCount: number;
	stripeInvoiceIds: string[];
	regions: PastCycleRegion[];
}

export interface ClusterUsageHistory {
	clusterId: string;
	selfManaged: boolean;
	cycles: PastCycle[];
	/** Pass back as `before` for the next page; null on the last one. */
	nextBefore: string | null;
	unplacedBlockCount: number;
}

export function getClusterUsageHistoryQueryOptions(clusterId?: string) {
	return infiniteQueryOptions({
		queryKey: ['clusterUsageHistory', clusterId],
		queryFn: async ({ pageParam }): Promise<ClusterUsageHistory> => {
			// Not in the generated OpenAPI types (a sub-path of /Cluster/{id}); typed by hand above.
			const { data } = await apiClient.get(`/Cluster/${clusterId}/usage/history` as never, {
				params: pageParam ? { before: pageParam } : undefined,
			});
			return data as ClusterUsageHistory;
		},
		initialPageParam: null as string | null,
		getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
		enabled: !!clusterId,
		// An ended cycle only changes when an invoice lands on it.
		staleTime: 5 * 60_000,
	});
}

export function useClusterUsageHistory(clusterId?: string) {
	return useInfiniteQuery(getClusterUsageHistoryQueryOptions(clusterId));
}
