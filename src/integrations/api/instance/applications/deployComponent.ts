import { InstanceClientConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { EntityIds } from '@/features/auth/store/authStore';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { SSEUnsupportedError } from '@/integrations/api/sse/errors';
import { useMutation } from '@tanstack/react-query';
import { DeployComponentResult, deployComponentStream, DeployStreamEvent } from './deployComponentStream';

export interface DeployComponentFormData {
	applicationName: string;
	applicationUrl: string;
	installCommand?: string;
}

export interface DeployComponentArgs extends DeployComponentFormData, InstanceClientConfig, InstanceTypeConfig {
	/** Entity id, used to resolve the SSE connection. Present on `useInstanceClientIdParams`. */
	entityId?: EntityIds;
	/** Opt into the live SSE deploy (only when the instance is Harper >= 5.1.0). */
	useSSE?: boolean;
	/** Live deploy events, when streaming. */
	onEvent?: (event: DeployStreamEvent) => void;
	/** Aborts the stream (e.g. explicit cancel). Modal close should NOT abort an in-flight deploy. */
	signal?: AbortSignal;
}

export async function onDeployComponentSubmit({
	applicationName,
	applicationUrl,
	installCommand,
	entityType,
	entityId,
	instanceClient,
	useSSE,
	onEvent,
	signal,
}: DeployComponentArgs): Promise<DeployComponentResult> {
	const replicated = entityType === 'cluster';

	if (useSSE && entityId) {
		try {
			return await deployComponentStream({
				connection: { id: entityId },
				package: applicationUrl,
				project: applicationName,
				replicated,
				install_command: installCommand,
				restart: 'rolling',
				signal,
				onEvent,
			});
		} catch (error) {
			// Couldn't establish a stream (bad response/content-type/connection) and no deploy
			// has started yet — safe to fall back to the proven buffered path below.
			if (!(error instanceof SSEUnsupportedError)) {
				// A terminal error, an inconclusive stream, or a deliberate abort. The deploy has
				// already started server-side, so we must NOT re-POST it (that would deploy
				// twice). Let the caller handle it (show the error, or poll on inconclusive).
				throw error;
			}
		}
	}

	const { data } = await instanceClient.post(
		'/',
		{
			operation: 'deploy_component',
			package: applicationUrl,
			project: applicationName,
			replicated,
			install_command: installCommand || undefined,
			restart: 'rolling',
		},
		{ timeout: 300_000 },
	);
	return data as ReplicatedResponse;
}

export function useDeployComponentMutation() {
	return useMutation({
		mutationFn: onDeployComponentSubmit,
	});
}
