// Central manager's read-only customer view of a cluster's workflow, `GET /Cluster/<id>/workflow`: the one holding the
// cluster, else the last one that did. Not in the OpenAPI document yet, so the shape is written here.
import { apiClient } from '@/config/apiClient';
import { errorStatus } from '@/lib/errorStatus';
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

/**
 * Keyed by the workflow holding the cluster, so the read starts over when one claims or releases it, and polled only
 * while one holds it. Null, which also ends the poll, is a central manager that has no workflow to show: a 404 for a
 * cluster that never had one or that the user can't see, and a 400 from one older than the endpoint, whose operations
 * proxy refuses the path.
 */
export function latestClusterWorkflowQueryOptions(clusterId: string | undefined, heldBy?: string | null) {
	const poll = pollUnlessForbidden(heldBy ? POLL_MS : false);
	return queryOptions({
		queryKey: ['cluster-workflow', clusterId ?? '', heldBy ?? ''],
		queryFn: async (): Promise<ClusterWorkflow | null> => {
			let data: unknown;
			try {
				({ data } = await apiClient.get(`/Cluster/${clusterId}/workflow` as '/Cluster/{id}'));
			} catch (error) {
				const status = errorStatus(error);
				if (status === 404 || status === 400) {
					return null;
				}
				throw error;
			}
			const row = data as Partial<ClusterWorkflow> | undefined;
			if (!row?.id || typeof row.status !== 'string') {
				return null;
			}
			return {
				...row,
				failedInstanceIds: Array.isArray(row.failedInstanceIds)
					? row.failedInstanceIds.filter((id) => typeof id === 'string')
					: [],
			} as ClusterWorkflow;
		},
		enabled: !!clusterId,
		retry: false,
		// An optional read beside the page: a failure is logged, never toasted.
		meta: { reportsOwnFailure: true },
		refetchInterval: (query) => (query.state.data === null ? false : poll(query)),
	});
}
