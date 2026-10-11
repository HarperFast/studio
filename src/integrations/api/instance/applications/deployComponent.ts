import { InstanceClientConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { EntityIds } from '@/features/auth/store/authStore';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { SSEInconclusiveError, SSEUnsupportedError } from '@/integrations/api/sse/errors';
import { useMutation } from '@tanstack/react-query';
import { DeployComponentResult, deployComponentStream, DeployStreamEvent } from './deployComponentStream';
import { explainDeployFailure } from './explainDeployFailure';
import { DeployRolloutError, followRestartJob } from './restartJob';

/**
 * What a `deploy_component` call does. `stage` builds and installs the release on every node without making it
 * live, and takes no `restart` (Harper refuses one); `activate` makes a staged or kept release live by its id and
 * installs nothing. Both need Harper 5.3.0 on every node — an older node reads a stage as an ordinary deploy and
 * serves it — so a caller offers them only on a version it could read.
 */
export type DeployRequest =
	| { kind: 'deploy'; project: string; package: string; installCommand?: string }
	| { kind: 'stage'; project: string; package: string; installCommand?: string }
	| { kind: 'activate'; project: string; deploymentId: string };

export function deployRequestBody(request: DeployRequest, replicated: boolean): Record<string, unknown> {
	if (request.kind === 'activate') {
		return {
			operation: 'deploy_component',
			project: request.project,
			deployment_id: request.deploymentId,
			replicated,
			restart: 'rolling',
		};
	}
	return {
		operation: 'deploy_component',
		package: request.package,
		project: request.project,
		replicated,
		install_command: request.installCommand || undefined,
		...(request.kind === 'stage' ? { activate: false } : { restart: 'rolling' }),
	};
}

export interface DeployComponentArgs extends InstanceClientConfig, InstanceTypeConfig {
	request: DeployRequest;
	/** Entity id, used to resolve the SSE connection. Present on `useInstanceClientIdParams`. */
	entityId?: EntityIds;
	/** Opt into the live SSE deploy (only when the instance is Harper >= 5.1.0). */
	useSSE?: boolean;
	/** Live deploy events, when streaming. */
	onEvent?: (event: DeployStreamEvent) => void;
	/** Aborts the stream (e.g. explicit cancel). Modal close should NOT abort an in-flight deploy. */
	signal?: AbortSignal;
}

/** Only a 4xx proves Harper never started the deploy: applications/DESIGN.md, "A live deploy is sent once". */
function refusedBeforeRunning({ status }: SSEUnsupportedError): boolean {
	return status !== undefined && status >= 400 && status < 500;
}

export async function onDeployComponentSubmit(args: DeployComponentArgs): Promise<DeployComponentResult> {
	try {
		return await deployComponent(args);
	} catch (error) {
		throw explainDeployFailure(error);
	}
}

async function deployComponent({
	request,
	entityType,
	entityId,
	instanceClient,
	useSSE,
	onEvent,
	signal,
}: DeployComponentArgs): Promise<DeployComponentResult> {
	const body = deployRequestBody(request, entityType === 'cluster');

	if (useSSE && entityId) {
		try {
			return await deployComponentStream({ connection: { id: entityId }, body, signal, onEvent });
		} catch (error) {
			if (!(error instanceof SSEUnsupportedError)) {
				// A terminal error, an inconclusive stream, or a deliberate abort. The deploy has
				// already started server-side, so we must NOT re-POST it (that would deploy
				// twice). Let the caller handle it (show the error, or poll on inconclusive).
				throw error;
			}
			if (!refusedBeforeRunning(error)) {
				throw new SSEInconclusiveError(
					'The live deploy did not stream and may already have started, so it was not sent again.',
					{ cause: error },
				);
			}
		}
	}

	const { data } = await instanceClient.post('/', body, { timeout: 300_000 });
	return data as ReplicatedResponse;
}

/**
 * Deploy, then — when the deploy handed its rolling restart to a job — follow that job, so the
 * deploy is not done until every other node has taken the release, or said why it did not.
 *
 * A failed job rejects with {@link DeployRolloutError}. A job Studio could not follow resolves with
 * `rollout.state === 'unfollowable'`, which no caller may report as success.
 */
export async function deployAndFollowComponent(args: DeployComponentArgs): Promise<DeployComponentResult> {
	const result = await onDeployComponentSubmit(args);
	const jobId = result?.restartJobId;
	if (typeof jobId !== 'string' || !jobId) {
		return result;
	}
	const rollout = await followRestartJob({
		instanceClient: args.instanceClient,
		jobId,
		signal: args.signal,
		onUpdate: (snapshot) => args.onEvent?.({ type: 'rollout', data: snapshot }),
	});
	if (rollout.state === 'failed') {
		throw new DeployRolloutError(rollout, result.deployment_id);
	}
	return { ...result, rollout };
}

export function useDeployComponentMutation(mutationKey?: readonly unknown[], meta?: Record<string, unknown>) {
	return useMutation({
		mutationKey,
		meta,
		mutationFn: deployAndFollowComponent,
	});
}
