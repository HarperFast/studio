import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';
import { DeploymentStatus, ListDeploymentsResponse } from './types';

export interface ListDeploymentsParams extends InstanceClientIdConfig {
	project?: string;
	status?: DeploymentStatus;
	since?: number;
	until?: number;
	limit?: number;
	offset?: number;
	enabled?: boolean;
}

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
	const { entityId, project, status, since, until, limit, offset } = params;
	return queryOptions({
		queryKey: [entityId, 'list_deployments', { project, status, since, until, limit, offset }] as const,
		queryFn: () => listDeployments(params),
		retry: false,
		enabled: params.enabled !== false,
	});
}
