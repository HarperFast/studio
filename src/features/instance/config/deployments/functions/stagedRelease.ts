import { Deployment, isTerminalDeploymentStatus } from '@/integrations/api/instance/deployments/types';

/**
 * What became of a staged release. Harper never rewrites a staged record: activating it writes a record of its own
 * whose `activated_from` names it (harper `components/operations.js:725-740`, v5.3.2), so the answer is in the
 * records that came after it.
 *
 * - `waiting`: nothing activated it.
 * - `activating`: an activation of it has not finished. Another one now would start a second rolling restart.
 * - `live`: its newest activation is the component's newest successful deploy, every node it reached took it, and
 *   no deploy after it failed. Activating it again swaps nothing and only restarts every worker (harper
 *   `components/Application.ts:4812-4821`, `operations.js:956`). The record cannot say whether the rolling restart
 *   that followed finished (`src/features/instance/applications/DESIGN.md`).
 * - `replaced`: a later deploy succeeded. Each node keeps the release it displaced, so activating this one again is a
 *   rollback, for as long as retention keeps it.
 * - `uncertain`: a deploy that touched it failed somewhere: its activation (`activation` absent, or `failed` is the
 *   activation itself, recording a node that failed) or a later deploy. A deploy that swapped in on the node that
 *   received it and then failed to replicate is recorded as failed (harper `components/operations.js:1021-1034`), so
 *   some nodes may run something else.
 * - `unknown`: the records after it could not be read.
 */
export type StagedReleaseState =
	| { kind: 'waiting' }
	| { kind: 'activating'; activation: Deployment }
	| { kind: 'live'; activation: Deployment }
	| { kind: 'replaced'; activation: Deployment; replacedBy: Deployment }
	| { kind: 'uncertain'; activation?: Deployment; failed: Deployment }
	| { kind: 'unknown' };

const startedAt = (record: Deployment | undefined) => record?.started_at ?? 0;

/** `records`: the component's records from `staged` on, in any order. Records of other components are ignored. */
export function stagedReleaseState(staged: Deployment, records: readonly Deployment[]): StagedReleaseState {
	const newestFirst = records
		.filter((record) => record.project === staged.project && record.deployment_id !== staged.deployment_id)
		.sort((a, b) => startedAt(b) - startedAt(a));
	const succeeded = newestFirst.filter((record) => record.status === 'success');
	const failedAfter = (after: Deployment | undefined, which: (record: Deployment) => boolean = () => true) =>
		newestFirst.find((record) => record.status === 'failed' && startedAt(record) > startedAt(after) && which(record));

	const running = newestFirst.find((record) =>
		!isTerminalDeploymentStatus(record.status) && record.activated_from === staged.deployment_id
		&& startedAt(record) > startedAt(succeeded[0])
	);
	if (running) {
		return { kind: 'activating', activation: running };
	}
	const activation = succeeded.find((record) => record.activated_from === staged.deployment_id);
	if (!activation) {
		// Once anything has succeeded since, a failed attempt at this one no longer decides what runs.
		const failed = failedAfter(succeeded[0], (record) => record.activated_from === staged.deployment_id);
		return failed ? { kind: 'uncertain', failed } : { kind: 'waiting' };
	}
	if (succeeded[0] !== activation) {
		return { kind: 'replaced', activation, replacedBy: succeeded[0] };
	}
	const failed = failedAfter(activation)
		?? (activation.peer_results?.some((peer) => peer.status === 'failed') ? activation : undefined);
	return failed ? { kind: 'uncertain', activation, failed } : { kind: 'live', activation };
}

/**
 * Where each component's records need to start to answer for every staged record of it: its earliest one, or
 * `undefined` (the whole history) when one of them has no start time.
 */
export function stagedReleaseHistoryStarts(deployments: readonly Deployment[]): Map<string, number | undefined> {
	const starts = new Map<string, number | undefined>();
	for (const { project, status, started_at } of deployments) {
		if (status !== 'staged') {
			continue;
		}
		if (!starts.has(project)) {
			starts.set(project, started_at);
			continue;
		}
		const current = starts.get(project);
		if (current !== undefined && (started_at === undefined || started_at < current)) {
			starts.set(project, started_at);
		}
	}
	return starts;
}
