import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getDeploymentsQueryOptions } from '@/integrations/api/instance/deployments/listDeployments';
import { Deployment, ListDeploymentsResponse } from '@/integrations/api/instance/deployments/types';
import { useQueries, UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { stagedReleaseHistoryStarts, StagedReleaseState, stagedReleaseState } from '../functions/stagedRelease';

const UNKNOWN: StagedReleaseState = { kind: 'unknown' };

// Module-level so `useQueries` re-runs it only when a result changes. A poll that fails keeps what the last one read;
// `null` is a history that has never been read.
function historyResults(results: UseQueryResult<ListDeploymentsResponse>[]) {
	return results.map((result) => (result.data === undefined && result.isError ? null : result.data));
}

/**
 * What became of each staged record in `deployments`, by id, or `undefined` while that is still loading. The
 * records that answer it can sit on another page or behind another filter, so each component with a staged record
 * gets a `list_deployments` of its own, from its earliest staged record on.
 */
export function useStagedReleases(
	deployments: readonly Deployment[],
): ReadonlyMap<string, StagedReleaseState | undefined> {
	const instanceParams = useInstanceClientIdParams();
	const starts = useMemo(() => [...stagedReleaseHistoryStarts(deployments)], [deployments]);
	const histories = useQueries({
		queries: starts.map(([project, since]) =>
			getDeploymentsQueryOptions({ ...instanceParams, project, since, pollWhileOpen: true })
		),
		combine: historyResults,
	});

	return useMemo(() => {
		const byProject = new Map(starts.map(([project], i) => [project, histories[i]]));
		const states = new Map<string, StagedReleaseState | undefined>();
		for (const deployment of deployments) {
			if (deployment.status !== 'staged') {
				continue;
			}
			const history = byProject.get(deployment.project);
			states.set(
				deployment.deployment_id,
				history === null ? UNKNOWN : history && stagedReleaseState(deployment, history.deployments),
			);
		}
		return states;
	}, [deployments, starts, histories]);
}
