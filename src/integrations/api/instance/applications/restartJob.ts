import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { getJob, HarperJob } from '@/integrations/api/instance/database/getJob';
import { errorText } from '@/lib/errorText';
import { sleep } from '@/lib/sleep';
import { isDeterministicRejection } from '@/react-query/pollUnlessForbidden';

/**
 * How a rolling deploy's other nodes took the release, read from the `restart_service` job the
 * receiving node starts and names in `restartJobId`.
 *
 * `unfollowable` means Studio stopped without learning how the job ended, so it claims nothing.
 */
export type RolloutState = 'following' | 'complete' | 'failed' | 'unfollowable';

/**
 * `not-found`: the node Studio reached has no such job. `hdb_job` does not replicate, so only the node
 * that received the deploy can answer for it, and a cluster's address may reach another node.
 */
export type UnfollowableReason = 'not-found' | 'refused' | 'timed-out';

/**
 * `activated` and `failed` come from a Harper 5.4+ activation job, where each node certifies the
 * release itself. `restarted` and `unconfirmed` come from the plain restart job older versions run:
 * there a node the job could not reach is listed with the error, and the job still completes.
 */
export type RolloutNodeOutcome = 'activated' | 'restarted' | 'failed' | 'unconfirmed';

export interface RolloutNode {
	node: string;
	outcome: RolloutNodeOutcome;
	/** That node's own canary verdict (`certified`, `uncertified`, ...), on an activation job. */
	certification?: string;
	detail?: string;
}

export interface RolloutSnapshot {
	jobId: string;
	state: RolloutState;
	nodes: RolloutNode[];
	message?: string;
	unfollowable?: UnfollowableReason;
}

// Harper's job worker records an object result under this message; a peer's restart job returns no
// result, so a peer that restarted reads exactly this, and one the job could not reach reads the error.
const PEER_RESTARTED = /^Successfully completed job\b/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nodeName(entry: Record<string, unknown>): string {
	return typeof entry.node === 'string' && entry.node ? entry.node : 'unknown node';
}

function activatedNodes(entries: unknown[]): RolloutNode[] {
	return entries.filter(isRecord).map((entry) => {
		const error = errorText(entry.error);
		if (error) {
			return { node: nodeName(entry), outcome: 'failed', detail: error };
		}
		return {
			node: nodeName(entry),
			outcome: 'activated',
			certification: typeof entry.certification === 'string' ? entry.certification : undefined,
		};
	});
}

function restartedNodes(entries: unknown[]): RolloutNode[] {
	return entries.filter(isRecord).map((entry) => {
		const message = errorText(entry.message);
		return message && PEER_RESTARTED.test(message)
			? { node: nodeName(entry), outcome: 'restarted' }
			: { node: nodeName(entry), outcome: 'unconfirmed', detail: message };
	});
}

/** Read one `get_job` row of a rolling deploy's restart job. */
export function readRestartJob(jobId: string, job: HarperJob): RolloutSnapshot {
	const status = typeof job.status === 'string' ? job.status.toUpperCase() : undefined;
	if (status === 'COMPLETE') {
		const result = isRecord(job.result) ? job.result : undefined;
		const nodes = Array.isArray(result?.activated)
			? activatedNodes(result.activated)
			: Array.isArray(result?.replicated)
			? restartedNodes(result.replicated)
			: [];
		return { jobId, state: nodes.some((node) => node.outcome === 'failed') ? 'failed' : 'complete', nodes };
	}
	if (status === 'ERROR') {
		// A 5.4+ activation job fails with its report as the message: `{ error, activated }`.
		const report = isRecord(job.message) ? job.message : undefined;
		return {
			jobId,
			state: 'failed',
			nodes: Array.isArray(report?.activated) ? activatedNodes(report.activated) : [],
			message: errorText(report ? report.error : job.message) ?? 'The restart job failed.',
		};
	}
	return { jobId, state: 'following', nodes: [] };
}

// Fast while a rollout is most likely to finish, then slower, so a long rollout — or a node that is
// down — costs a few requests a minute rather than thirty.
export function rolloutPollDelayMs(elapsedMs: number, fastMs: number): number {
	if (elapsedMs < 60_000) {
		return fastMs;
	}
	return elapsedMs < 5 * 60_000 ? 5_000 : 15_000;
}

// A cluster's address can reach a node other than the one that received the deploy, and reach that one
// again on the next request, so a missing row only counts once the job has stayed missing for a while.
const NOT_FOUND_GRACE_MS = 20_000;

export interface FollowRestartJobParams extends InstanceClientConfig {
	jobId: string;
	onUpdate?: (snapshot: RolloutSnapshot) => void;
	signal?: AbortSignal;
	pollIntervalMs?: number;
	timeoutMs?: number;
}

/**
 * Poll `get_job` until the restart job ends, and say how each other node took the release.
 *
 * Harper writes the job's row when it starts and when it ends, so every node's outcome arrives at once.
 * Rejects only when `signal` aborts: a job Studio could not follow resolves `unfollowable`.
 */
export async function followRestartJob({
	instanceClient,
	jobId,
	onUpdate,
	signal,
	pollIntervalMs = 2_000,
	timeoutMs = 30 * 60_000,
}: FollowRestartJobParams): Promise<RolloutSnapshot> {
	const settle = (snapshot: RolloutSnapshot) => {
		onUpdate?.(snapshot);
		return snapshot;
	};
	const unfollowable = (reason: UnfollowableReason) =>
		settle({ jobId, state: 'unfollowable', nodes: [], unfollowable: reason });
	const startedAt = Date.now();
	let missingSince: number | undefined;
	onUpdate?.({ jobId, state: 'following', nodes: [] });
	for (;;) {
		signal?.throwIfAborted();
		try {
			const job = await getJob({ jobId, instanceClient });
			if (job) {
				missingSince = undefined;
				const snapshot = readRestartJob(jobId, job);
				if (snapshot.state !== 'following') {
					return settle(snapshot);
				}
			} else {
				missingSince ??= Date.now();
				if (Date.now() - missingSince >= NOT_FOUND_GRACE_MS) {
					return unfollowable('not-found');
				}
			}
		} catch (error) {
			// Anything else — a dropped connection, a 5xx while that node's own workers restart — passes.
			if (isDeterministicRejection(error)) {
				return unfollowable('refused');
			}
		}
		const elapsed = Date.now() - startedAt;
		if (elapsed >= timeoutMs) {
			return unfollowable('timed-out');
		}
		await sleep(rolloutPollDelayMs(elapsed, pollIntervalMs));
	}
}

/**
 * A rolling deploy whose release is live on the node that received it, but whose restart job failed.
 * Datadog withholds its message by this `name`: it quotes each node's error, which can carry the
 * component's own load failure.
 */
export class DeployRolloutError extends Error {
	readonly rollout: RolloutSnapshot;
	readonly deploymentId?: string;

	constructor(rollout: RolloutSnapshot, deploymentId?: string) {
		const failed = rollout.nodes.filter((node) => node.outcome === 'failed').map((node) => node.node);
		super(
			rollout.message
				?? (failed.length ? `Not every node took this release: ${failed.join(', ')}.` : 'The restart job failed.'),
		);
		this.name = 'DeployRolloutError';
		this.rollout = rollout;
		this.deploymentId = deploymentId;
	}
}
