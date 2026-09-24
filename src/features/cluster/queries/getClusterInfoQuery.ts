import { apiClient } from '@/config/apiClient';
import { Cluster } from '@/integrations/api/api.patch';
import { syncRestartsFromCluster } from '@/lib/restart/restartTracker';
import { pollUnlessForbidden } from '@/react-query/pollUnlessForbidden';
import { QueryClient, queryOptions } from '@tanstack/react-query';

export async function getClusterInfo(clusterId: string) {
	const requestedAt = Date.now();
	const { data } = await apiClient.get(`/Cluster/${clusterId}` as '/Cluster/{id}');
	// Every cluster read doubles as the restart tracker's view of central manager's container ops.
	syncRestartsFromCluster(data as Cluster, requestedAt);
	return data as Cluster;
}

/**
 * Flip `resetPassword` off on the cached cluster once admin setup has completed server-side.
 * Cancels any in-flight poll first so it can't overwrite the flag after we set it.
 */
export async function markClusterPasswordSet(queryClient: QueryClient, clusterId: string) {
	const { queryKey } = getClusterInfoQueryOptions(clusterId);
	await queryClient.cancelQueries({ queryKey, exact: true });
	queryClient.setQueryData<Cluster>(
		queryKey,
		(cluster) => cluster && { ...cluster, resetPassword: false },
	);
}

export function getClusterInfoQueryOptions(clusterId?: string | false, refetch?: boolean | number) {
	return queryOptions({
		queryKey: [clusterId],
		queryFn: () => getClusterInfo(clusterId as string),
		retry: false,
		staleTime: 1_900,
		enabled: !!clusterId,
		// A cluster the user can't read answers 403 on every poll — stop the timer
		// rather than retrying it every 10s for the life of the page.
		refetchInterval: pollUnlessForbidden(
			refetch
				? refetch === true
					? 10_000
					: refetch
				: undefined,
		),
	});
}
