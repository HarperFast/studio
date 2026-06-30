import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { EntityIds } from '@/features/auth/store/authStore';
import {
	DeployInstallEvent,
	DeployPeerEvent,
	DeployPhaseEvent,
	DeployStreamEvent,
} from '@/integrations/api/instance/applications/deployComponentStream';
import { parseSSEData } from '@/integrations/api/sse/parseSSEStream';
import { ResolveInstanceConnectionParams } from '@/integrations/api/sse/resolveInstanceConnection';
import { streamOperation } from '@/integrations/api/sse/streamOperation';
import { queryOptions } from '@tanstack/react-query';
import { Deployment, isTerminalDeploymentStatus } from './types';

export interface GetDeploymentParams extends InstanceClientIdConfig {
	deploymentId: string;
}

export async function getDeployment({
	instanceClient,
	deploymentId,
}: GetDeploymentParams): Promise<Deployment> {
	const { data } = await instanceClient.post('/', {
		operation: 'get_deployment',
		deployment_id: deploymentId,
	});
	return data as Deployment;
}

export function getDeploymentQueryOptions(params: GetDeploymentParams & { pollWhileActive?: boolean }) {
	return queryOptions({
		queryKey: [params.entityId, 'get_deployment', params.deploymentId] as const,
		queryFn: () => getDeployment(params),
		retry: false,
		// While the detail view falls back to polling (no SSE), keep refetching until the
		// deployment reaches a terminal status, then stop.
		refetchInterval: (query) =>
			params.pollWhileActive && !isTerminalDeploymentStatus(query.state.data?.status) ? 2_000 : false,
	});
}

export interface GetDeploymentStreamParams {
	connection: ResolveInstanceConnectionParams;
	deploymentId: string;
	signal?: AbortSignal;
	/** Live events: replayed `event_log` entries first, then live tail until terminal. */
	onEvent?: (event: DeployStreamEvent) => void;
}

/**
 * Tail a deployment's progress over SSE: `get_deployment` with `Accept: text/event-stream`
 * replays the row's `event_log`, then streams live `ProgressEmitter` events until the
 * deploy reaches a terminal status, resolving with the final post-deploy row.
 *
 * Throws the transport errors from `@/integrations/api/sse/errors` (caller falls back to
 * polling `getDeploymentQueryOptions` on `SSEUnsupportedError` / `SSEInconclusiveError`).
 */
export async function getDeploymentStream({
	connection,
	deploymentId,
	signal,
	onEvent,
}: GetDeploymentStreamParams): Promise<Deployment> {
	const result = await streamOperation({
		connection,
		body: { operation: 'get_deployment', deployment_id: deploymentId },
		signal,
		onMessage: (message) => {
			if (!onEvent) {
				return;
			}
			switch (message.event) {
				case 'phase':
					onEvent({ type: 'phase', data: parseSSEData(message) as DeployPhaseEvent });
					break;
				case 'install':
					onEvent({ type: 'install', data: parseSSEData(message) as DeployInstallEvent });
					break;
				case 'peer':
					onEvent({ type: 'peer', data: parseSSEData(message) as DeployPeerEvent });
					break;
			}
		},
	});
	return (result ?? {}) as Deployment;
}

/** Resolve the SSE connection params for an entity. */
export function deploymentConnection(id: EntityIds): ResolveInstanceConnectionParams {
	return { id };
}
