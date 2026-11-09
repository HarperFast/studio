import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

/**
 * The name of the node this connection reaches, from `cluster_status`'s `node_name` (harper-pro
 * `replication/clusterStatus.ts`). Each node keeps its own copy of derived state such as a full-text
 * index, so a reading from one node is only that node's.
 *
 * `null` when it can't be told: open-source Harper has no `cluster_status` ("Operation not found"),
 * and it needs a super user. Neither is worth an error toast, so every failure reads as `null`.
 *
 * It is a separate request from the one it labels. Through the central manager every request for a
 * cluster goes to the same running instance, and a direct connection reuses its socket, so in practice
 * both reach the same node; nothing guarantees it.
 */
export function getAnsweringNodeNameQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [entityId, 'cluster_status', 'node_name'] as const,
		staleTime: 60_000,
		retry: false,
		queryFn: async (): Promise<string | null> => {
			try {
				const { data } = await instanceClient.post<{ node_name?: unknown }>('/', { operation: 'cluster_status' });
				return typeof data?.node_name === 'string' && data.node_name ? data.node_name : null;
			} catch (error) {
				console.debug('cluster_status unavailable; not naming the answering node', error);
				return null;
			}
		},
	});
}
