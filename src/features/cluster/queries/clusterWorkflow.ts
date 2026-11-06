// Central manager's customer view of the workflow holding a cluster: `GET /Cluster/<id>/workflow` and
// `POST /Cluster/<id>/workflow/<command>`. Not in the OpenAPI document yet, so the shapes are written here.
import { apiClient } from '@/config/apiClient';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/** The commands central manager lets a cluster's own users send, and only when `acceptedCommands` lists them. */
export const CLUSTER_WORKFLOW_COMMANDS = ['retry', 'abandon'] as const;
export type ClusterWorkflowCommand = (typeof CLUSTER_WORKFLOW_COMMANDS)[number];

export interface ClusterWorkflow {
	id: string;
	type: string;
	status: string;
	phase?: string | null;
	pause?: { reason?: string | null; at?: string | null } | null;
	/** Instances whose update didn't finish. */
	failedInstanceIds: string[];
	/** Central manager's explanation, worded for customers. */
	message?: string | null;
	acceptedCommands: ClusterWorkflowCommand[];
	/** A command sent but not yet picked up. */
	command?: { action?: string | null; at?: string | null } | null;
}

const POLL_MS = 10_000;
const statusOf = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status;

/**
 * Polls while a workflow holds the cluster. A 403 or 404 (an older central manager, or the workflow just ended) stops
 * polling; the notice then shows its plain state. `quietErrors`: the notice already copes without this read.
 */
export function clusterWorkflowQueryOptions(clusterId: string | undefined, workflowId: string | null | undefined) {
	return queryOptions({
		queryKey: ['cluster-workflow', clusterId ?? '', workflowId ?? ''],
		queryFn: async (): Promise<ClusterWorkflow | null> => {
			const { data } = await apiClient.get(`/Cluster/${clusterId}/workflow` as '/Cluster/{id}');
			const row = data as unknown as Partial<ClusterWorkflow> | undefined;
			if (!row?.id || row.id !== workflowId) { return null; }
			return {
				...row,
				failedInstanceIds: Array.isArray(row.failedInstanceIds)
					? row.failedInstanceIds.filter((id) => typeof id === 'string')
					: [],
				acceptedCommands: Array.isArray(row.acceptedCommands)
					? row.acceptedCommands.filter((command) => CLUSTER_WORKFLOW_COMMANDS.includes(command))
					: [],
			} as ClusterWorkflow;
		},
		enabled: !!clusterId && !!workflowId,
		retry: false,
		meta: { quietErrors: true },
		refetchInterval: (query) => ([403, 404].includes(statusOf(query.state.error) ?? 0) ? false : POLL_MS),
	});
}

/**
 * Failures toast through the global MutationCache handler. `networkMode: 'always'` so an offline click fails at once
 * instead of being sent on reconnect. Every settle refetches the cluster and its workflow: a refused command means the
 * row moved on, and an unanswered one may have landed.
 */
export function useClusterWorkflowCommand() {
	const queryClient = useQueryClient();
	return useMutation({
		networkMode: 'always',
		mutationFn: async ({ clusterId, command }: { clusterId: string; command: ClusterWorkflowCommand }) => {
			await apiClient.post(`/Cluster/${clusterId}/workflow/${command}` as '/Cluster/{id}', {});
		},
		onSuccess: (_data, { command }) => {
			toast.success(command === 'retry' ? 'Retrying the update' : 'Stopping the update');
		},
		onSettled: (_data, _error, { clusterId }) => {
			void queryClient.invalidateQueries({ queryKey: ['cluster-workflow', clusterId] });
			void queryClient.invalidateQueries({ queryKey: getClusterInfoQueryOptions(clusterId).queryKey, exact: true });
		},
	});
}
