import { InstanceClientConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { EntityIds } from '@/features/auth/store/authStore';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { SSEInconclusiveError, SSEUnsupportedError } from '@/integrations/api/sse/errors';
import { useMutation } from '@tanstack/react-query';
import { BranchedDatabases } from './branchedDatabases';
import { DeployComponentResult, deployComponentStream, DeployStreamEvent } from './deployComponentStream';
import { explainDeployFailure } from './explainDeployFailure';
import { fetchComponentArchive } from './packageComponent';
import { DeployRolloutError, followRestartJob } from './restartJob';

/**
 * What a `deploy_component` call does. `stage` builds and installs the release on every node without making it
 * live, and takes no `restart` (Harper refuses one); `activate` makes a staged or kept release live by its id and
 * installs nothing. Both need Harper 5.3.0 on every node — an older node reads a stage as an ordinary deploy and
 * serves it — so a caller offers them only on a version it could read.
 *
 * A deploy replaces the application's root-config entry whole, so leaving out `branchedDatabases` turns the
 * application's private database copy off. A stage records the entry with the release, and activating that release
 * writes it; an activation can't carry the setting itself.
 *
 * `payload` deploys an archive of the application's own files. From 5.4 it writes only the entry's routing keys,
 * keeping any it isn't sent, so its `branchedDatabases` is required and Off is `[]`. It goes only as a multipart
 * upload over a direct connection, never as base64 in JSON.
 */
export type DeployRequest =
	| { kind: 'deploy'; project: string; package: string; installCommand?: string; branchedDatabases?: BranchedDatabases }
	| { kind: 'stage'; project: string; package: string; installCommand?: string; branchedDatabases?: BranchedDatabases }
	| { kind: 'activate'; project: string; deploymentId: string }
	| { kind: 'payload'; project: string; archive: Blob; branchedDatabases: BranchedDatabases };

export function deployRequestBody(request: DeployRequest, replicated: boolean): Record<string, unknown> {
	if (request.kind === 'payload') {
		return {
			operation: 'deploy_component',
			project: request.project,
			replicated,
			restart: 'rolling',
			branchedDatabases: request.branchedDatabases,
		};
	}
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
		branchedDatabases: request.branchedDatabases,
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

	if (request.kind === 'payload') {
		return deployPayload(body, request.archive, { entityId, signal, onEvent });
	}

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

async function deployPayload(
	body: Record<string, unknown>,
	archive: Blob,
	{ entityId, signal, onEvent }: Pick<DeployComponentArgs, 'entityId' | 'signal' | 'onEvent'>,
): Promise<DeployComponentResult> {
	if (!entityId) {
		throw new Error('Studio has no connection to send this deploy over.');
	}
	try {
		return await deployComponentStream({
			connection: { id: entityId },
			body,
			file: { name: 'payload', filename: 'package.tar.gz', blob: archive },
			signal,
			onEvent,
		});
	} catch (error) {
		if (!(error instanceof SSEUnsupportedError)) {
			throw error;
		}
		// Never resent buffered, which would mean base64 in JSON.
		if (refusedBeforeRunning(error)) {
			throw new Error(error.refusal ?? `Harper refused the deploy (status ${error.status}).`, { cause: error });
		}
		throw new SSEInconclusiveError(
			'The deploy did not stream and may already have started, so it was not sent again.',
			{ cause: error },
		);
	}
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

/** Packaging failed, so no deploy was sent. */
export class PackagingError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'PackagingError';
	}
}

export interface DeployApplicationFilesArgs extends Omit<DeployComponentArgs, 'request' | 'useSSE'> {
	project: string;
	branchedDatabases: BranchedDatabases;
	skipNodeModules: boolean;
	/** Called once the archive is in hand, before the deploy is sent. */
	onPackaged?: () => void;
}

/** Package `project`'s files as they are now and deploy them again, as a payload carrying `branchedDatabases`. */
export async function deployApplicationFiles({
	project,
	branchedDatabases,
	skipNodeModules,
	onPackaged,
	...args
}: DeployApplicationFilesArgs): Promise<DeployComponentResult> {
	let archive: Blob;
	try {
		archive = await fetchComponentArchive({
			connection: { id: args.entityId },
			project,
			skipNodeModules,
			signal: args.signal,
		});
	} catch (error) {
		throw new PackagingError(error instanceof Error ? error.message : String(error), { cause: error });
	}
	onPackaged?.();
	return deployAndFollowComponent({ ...args, request: { kind: 'payload', project, archive, branchedDatabases } });
}

export function useDeployApplicationFilesMutation(mutationKey: readonly unknown[]) {
	return useMutation({
		mutationKey,
		mutationFn: deployApplicationFiles,
		// The caller shows its own failure, as for every deploy.
		meta: { skipGlobalErrorToast: true },
		onError: (error) => console.error(error),
	});
}

export function useDeployComponentMutation(mutationKey?: readonly unknown[]) {
	return useMutation({
		mutationKey,
		mutationFn: deployAndFollowComponent,
		// Every caller shows its own failure: applications/DESIGN.md, "Who reports a failed deploy".
		meta: { skipGlobalErrorToast: true },
		onError: (error) => console.error(error),
	});
}
