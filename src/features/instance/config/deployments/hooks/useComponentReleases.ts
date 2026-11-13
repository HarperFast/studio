import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useReleaseTrackingAvailable } from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { useInstanceOperationPermission } from '@/hooks/useInstanceOperationPermission';
import { getDeploymentsQueryOptions } from '@/integrations/api/instance/deployments/listDeployments';
import { getReleasesQueryOptions } from '@/integrations/api/instance/deployments/listReleases';
import { isTerminalDeploymentStatus, ListDeploymentsResponse } from '@/integrations/api/instance/deployments/types';
import { describeError } from '@/react-query/queryClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import {
	ReleaseAvailability,
	releaseAvailability,
	ReleasesSummary,
	summarizeReleases,
} from '../functions/releaseCoverage';

/** `unsupported`: older than Harper 5.4.0-alpha.1, or its version is not known yet, so nothing can be asked. */
type ComponentReleasesState =
	| { kind: 'unsupported' }
	/** `previous`: the answer being replaced, for display only. */
	| { kind: 'checking'; previous?: ReleasesSummary }
	| { kind: 'unreadable'; message: string }
	| { kind: 'ready'; summary: ReleasesSummary };

/**
 * What changes when what a node holds of the component may have: a deploy or an activation of it starting or ending,
 * and each node a rolling one reaches, which its job records on the row as it goes. The steps of a build before it
 * goes live share one value: each would otherwise make every node walk its releases again while it installs.
 */
function recordsGeneration({ total, deployments: [newestDeployment] }: ListDeploymentsResponse): string {
	const status = newestDeployment?.status;
	const phase = isTerminalDeploymentStatus(status) || status === 'rolling_out' ? status : 'building';
	const activations = (newestDeployment?.peer_results ?? [])
		.map((peer) => (peer.activation ? (peer.activation.activated ? '+' : '-') : '.'))
		.join('');
	return `${total}|${newestDeployment?.deployment_id}|${phase}|${activations}`;
}

type ReleasesQueryKey = ReturnType<typeof getReleasesQueryOptions>['queryKey'];

const newestRecordQuery = (instanceParams: InstanceClientIdConfig, project: string | undefined, enabled = true) =>
	getDeploymentsQueryOptions({ ...instanceParams, project, limit: 1, enabled, pollWhileOpen: true });

/**
 * What is live and kept for `project` on each node, from `list_releases`, asked again for each new generation of the
 * component's records. An answer still being asked for, or one that failed, enables nothing.
 */
export function useComponentReleases(project: string | undefined) {
	const instanceParams = useInstanceClientIdParams();
	const canListReleases = useInstanceOperationPermission('list_releases');
	const supported = useReleaseTrackingAvailable() && !!project && canListReleases;
	const { data: newest, error: newestError } = useQuery(newestRecordQuery(instanceParams, project, supported));
	const generation = newest && recordsGeneration(newest);
	const { data, error, status, isPlaceholderData, fetchStatus } = useQuery(
		getReleasesQueryOptions({
			...instanceParams,
			project: project ?? '',
			generation,
			enabled: supported && generation !== undefined,
		}),
	);
	const state = useMemo<ComponentReleasesState>(() => {
		if (!supported) {
			return { kind: 'unsupported' };
		}
		if (status === 'error') {
			return { kind: 'unreadable', message: describeError(error).message };
		}
		// A record that can no longer be read may have changed: what was asked for it is no longer known to be current.
		if (newestError) {
			return { kind: 'unreadable', message: describeError(newestError).message };
		}
		const summary = data && summarizeReleases(data, project!);
		return summary && status === 'success' && !isPlaceholderData && fetchStatus === 'idle'
			? { kind: 'ready', summary }
			: { kind: 'checking', previous: summary };
	}, [supported, data, error, status, isPlaceholderData, fetchStatus, newestError, project]);
	return { state };
}

/**
 * Reads the records of `onlyProject`, or of every component, again, then asks the nodes again once for each open view
 * of them: under its generation if the records held, or under the new one, which the view joins when it renders, if they
 * moved. Every other answer is marked stale, for the next view that reads it. Rejects, once every view has its answer,
 * if any view's records or nodes could not be read: an activation must not be confirmed over the answer before.
 */
export function useRetryReleases(onlyProject?: string): () => Promise<unknown> {
	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	return useCallback(async () => {
		const scope = onlyProject === undefined ? [] : [{ project: onlyProject }];
		const releasesKey = [instanceParams.entityId, 'list_releases'];
		await queryClient.invalidateQueries({ queryKey: [...releasesKey, ...scope], refetchType: 'none' });
		const recordsKey = [instanceParams.entityId, 'list_deployments', ...scope];
		await queryClient.invalidateQueries({ queryKey: recordsKey });
		const unread = queryClient.getQueryCache().findAll({ queryKey: recordsKey, type: 'active' })
			.filter((query) => query.state.status === 'error');
		// A view whose records never read is disabled, not gone, and is asked under the generation they now give.
		const views = queryClient.getQueryCache().findAll({
			queryKey: [...releasesKey, ...scope],
			predicate: (query) => query.getObserversCount() > 0,
		});
		const asked = await Promise.allSettled(views.map(async (view) => {
			const [, , { project }] = view.queryKey as ReleasesQueryKey;
			const records = queryClient.getQueryState(newestRecordQuery(instanceParams, project).queryKey);
			if (records?.status !== 'success' || !records.data) {
				throw records?.error ?? new Error(`The deployments of ${project} could not be read.`);
			}
			return queryClient.fetchQuery(
				getReleasesQueryOptions({ ...instanceParams, project, generation: recordsGeneration(records.data) }),
			);
		}));
		const failed = asked.find((result) => result.status === 'rejected');
		if (failed) {
			throw failed.reason;
		}
		const stillUnread = unread.find((query) => query.state.status === 'error');
		if (stillUnread) {
			throw stillUnread.state.error;
		}
	}, [queryClient, instanceParams, onlyProject]);
}

/**
 * Asks again as `useRetryReleases` does, then resolves to whether that answer lets every node take `releaseId`. Read
 * from the cache it just filled, not from a render, which reaches the views a tick later.
 */
export function useRecheckRelease(project: string, releaseId: string): () => Promise<boolean> {
	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const retry = useRetryReleases(project);
	return useCallback(async () => {
		await retry();
		const records = queryClient.getQueryData(newestRecordQuery(instanceParams, project).queryKey);
		if (!records) {
			throw new Error(`The deployments of ${project} could not be read.`);
		}
		const answer = await queryClient.fetchQuery(
			getReleasesQueryOptions({ ...instanceParams, project, generation: recordsGeneration(records) }),
		);
		return releaseAvailability(summarizeReleases(answer, project), releaseId).kind === 'available';
	}, [queryClient, instanceParams, retry, project, releaseId]);
}

export type ReleaseCheck =
	| { kind: 'unsupported' }
	| { kind: 'checking' }
	| { kind: 'unreadable'; message: string }
	| ReleaseAvailability;

export function useReleaseCheck(project: string, releaseId: string): ReleaseCheck {
	const { state } = useComponentReleases(project);
	return useMemo(
		() =>
			state.kind === 'ready'
				? releaseAvailability(state.summary, releaseId)
				: state.kind === 'checking'
				? { kind: 'checking' }
				: state,
		[state, releaseId],
	);
}
