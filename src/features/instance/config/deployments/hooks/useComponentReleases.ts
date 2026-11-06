import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useReleaseTrackingAvailable } from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
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
	const supported = useReleaseTrackingAvailable() && !!project;
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
 * Reads the records again, then asks the nodes again for each open view whose records read back with the same
 * generation. A view whose generation moved asks by itself, and asking under the old one as well would walk every node
 * twice; one whose records failed to read stays unreadable whatever it is told. Every other answer is marked stale, for
 * the next view that reads it.
 */
export function useRetryReleases(): () => Promise<unknown> {
	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	return useCallback(async () => {
		const releasesKey = [instanceParams.entityId, 'list_releases'];
		await queryClient.invalidateQueries({ queryKey: releasesKey, refetchType: 'none' });
		await queryClient.invalidateQueries({ queryKey: [instanceParams.entityId, 'list_deployments'] });
		const held = queryClient.getQueryCache().findAll({ queryKey: releasesKey, type: 'active' }).filter((query) => {
			const [, , { project }, generation] = query.queryKey as ReleasesQueryKey;
			const records = queryClient.getQueryState(newestRecordQuery(instanceParams, project).queryKey);
			return records?.status === 'success' && !!records.data && recordsGeneration(records.data) === generation;
		});
		await Promise.all(
			held.map(({ queryKey }) => queryClient.refetchQueries({ queryKey, exact: true }, { cancelRefetch: false })),
		);
	}, [queryClient, instanceParams]);
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
