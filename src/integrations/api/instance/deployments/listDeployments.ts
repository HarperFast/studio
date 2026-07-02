import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';
import { DeploymentStatus, isTerminalDeploymentStatus, ListDeploymentsResponse } from './types';

export interface ListDeploymentsParams extends InstanceClientIdConfig {
	project?: string;
	status?: DeploymentStatus;
	since?: number;
	until?: number;
	limit?: number;
	offset?: number;
	enabled?: boolean;
	/**
	 * Poll the list while the view is open so deploys triggered elsewhere appear and their
	 * status transitions land without a manual refresh. `hdb_deployment` is a system table and
	 * isn't exposed as a subscribable resource, so polling is the live-update mechanism.
	 */
	pollWhileOpen?: boolean;
}

// Poll fast while a deploy is in flight (status changes every few seconds), slower otherwise
// (just catching newly-started deploys).
const ACTIVE_POLL_MS = 2_000;
const IDLE_POLL_MS = 10_000;

export async function listDeployments({
	instanceClient,
	project,
	status,
	since,
	until,
	limit,
	offset,
}: ListDeploymentsParams): Promise<ListDeploymentsResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'list_deployments',
		project,
		status,
		since,
		until,
		limit,
		offset,
	});
	return data as ListDeploymentsResponse;
}

export function getDeploymentsQueryOptions(params: ListDeploymentsParams) {
	const { entityId, project, status, since, until, limit, offset, pollWhileOpen } = params;
	return queryOptions({
		queryKey: [entityId, 'list_deployments', { project, status, since, until, limit, offset }] as const,
		queryFn: () => listDeployments(params),
		retry: false,
		enabled: params.enabled !== false,
		refetchInterval: pollWhileOpen
			? (query) => {
				const deployments = query.state.data?.deployments ?? [];
				const anyActive = deployments.some((d) => !isTerminalDeploymentStatus(d.status));
				return anyActive ? ACTIVE_POLL_MS : IDLE_POLL_MS;
			}
			: false,
	});
}
