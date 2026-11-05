import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useReleaseTrackingAvailable } from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { getDeploymentsQueryOptions } from '@/integrations/api/instance/deployments/listDeployments';
import { getReleasesQueryOptions } from '@/integrations/api/instance/deployments/listReleases';
import { ListDeploymentsResponse } from '@/integrations/api/instance/deployments/types';
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
 * and each node a rolling one reaches, which its job records on the row as it goes.
 */
function recordsGeneration({ total, deployments: [newest] }: ListDeploymentsResponse): string {
	const activations = (newest?.peer_results ?? [])
		.map((peer) => (peer.activation ? (peer.activation.activated ? '+' : '-') : '.'))
		.join('');
	return `${total}|${newest?.deployment_id}|${newest?.status}|${activations}`;
}

/**
 * What is live and kept for `project` on each node, from `list_releases`, asked again for each new generation of the
 * component's records. An answer still being asked for, or one that failed, enables nothing.
 */
export function useComponentReleases(project: string | undefined) {
	const instanceParams = useInstanceClientIdParams();
	const supported = useReleaseTrackingAvailable() && !!project;
	const { data: newest, error: newestError } = useQuery(
		getDeploymentsQueryOptions({ ...instanceParams, project, limit: 1, enabled: supported, pollWhileOpen: true }),
	);
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

export function useRetryReleases(): () => Promise<unknown> {
	const queryClient = useQueryClient();
	const { entityId } = useInstanceClientIdParams();
	return useCallback(
		() =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: [entityId, 'list_deployments'] }),
				queryClient.invalidateQueries({ queryKey: [entityId, 'list_releases'] }),
			]),
		[queryClient, entityId],
	);
}

export type ReleaseCheck =
	| { kind: 'unsupported' }
	| { kind: 'checking' }
	| { kind: 'unreadable'; message: string }
	| ReleaseAvailability;

/** Whether activating `releaseId` of `project` can reach every node, or why that is not known. */
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
