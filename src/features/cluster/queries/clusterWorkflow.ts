// Central manager's read-only customer view of a cluster's workflow, `GET /Cluster/<id>/workflow`: the one holding the
// cluster, else the last one that did. Not in the OpenAPI document yet, so the shape is written here.
import { apiClient } from '@/config/apiClient';
import { pollUnlessForbidden } from '@/react-query/pollUnlessForbidden';
import { queryOptions } from '@tanstack/react-query';

export interface ClusterWorkflow {
	id: string;
	type: string;
	/** Active (`PAUSED`, `RUNNING`, …) while it holds the cluster, else how it ended (`SUCCEEDED`, `UNDONE`, `ABANDONED`). */
	status: string;
	phase?: string | null;
	pause?: { reason?: string | null; at?: string | null } | null;
	failedInstanceIds: string[];
	/** A customer-safe sentence central manager composes for a failure. */
	message?: string | null;
}

const POLL_MS = 10_000;
const statusOf = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status;

/**
 * Keyed by the workflow holding the cluster, so the read starts over when one claims or releases it. A 404 is a cluster
 * that never had one or that the user can't see, or a central manager without the endpoint.
 */
export function latestClusterWorkflowQueryOptions(clusterId: string | undefined, heldBy: string | null | undefined) {
	const poll = pollUnlessForbidden(heldBy ? POLL_MS : false);
	return queryOptions({
		queryKey: ['cluster-workflow', clusterId ?? '', heldBy ?? ''],
		queryFn: async (): Promise<ClusterWorkflow | null> => {
			const { data } = await apiClient.get(`/Cluster/${clusterId}/workflow` as '/Cluster/{id}');
			const row = data as unknown as Partial<ClusterWorkflow> | undefined;
			if (!row?.id || typeof row.status !== 'string') { return null; }
			return {
				...row,
				failedInstanceIds: Array.isArray(row.failedInstanceIds)
					? row.failedInstanceIds.filter((id) => typeof id === 'string')
					: [],
			} as ClusterWorkflow;
		},
		enabled: !!clusterId,
		retry: false,
		meta: { quietErrors: true },
		refetchInterval: (query) => (statusOf(query.state.error) === 404 ? false : poll(query)),
	});
}
