import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useReleaseTrackingAvailable } from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { getReleasesQueryOptions } from '@/integrations/api/instance/deployments/listReleases';
import { describeError } from '@/react-query/queryClient';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
	ReleaseAvailability,
	releaseAvailability,
	ReleasesSummary,
	summarizeReleases,
} from '../functions/releaseCoverage';

/** `unsupported`: older than Harper 5.4.0-alpha.1, or its version is not known yet, so nothing can be asked. */
export type ComponentReleasesState =
	| { kind: 'unsupported' }
	| { kind: 'checking' }
	| { kind: 'unreadable'; message: string }
	| { kind: 'ready'; summary: ReleasesSummary };

/** What is live and kept for `project` on each node, from `list_releases`. */
export function useComponentReleases(project: string | undefined) {
	const instanceParams = useInstanceClientIdParams();
	const supported = useReleaseTrackingAvailable() && !!project;
	const query = useQuery(getReleasesQueryOptions({ ...instanceParams, project: project ?? '', enabled: supported }));
	const { data, error, isPending, refetch, isFetching } = query;
	const state = useMemo<ComponentReleasesState>(() => {
		if (!supported) {
			return { kind: 'unsupported' };
		}
		if (data) {
			return { kind: 'ready', summary: summarizeReleases(data, project!) };
		}
		if (error) {
			return { kind: 'unreadable', message: describeError(error).message };
		}
		return isPending ? { kind: 'checking' } : { kind: 'unreadable', message: 'no answer' };
	}, [supported, data, error, isPending, project]);
	return { state, refetch, isFetching };
}

export type ReleaseCheck = Exclude<ComponentReleasesState, { kind: 'ready' }> | ReleaseAvailability;

/** Whether activating `releaseId` of `project` can reach every node, or why that is not known. */
export function useReleaseCheck(project: string, releaseId: string): ReleaseCheck {
	const { state } = useComponentReleases(project);
	return useMemo(() => state.kind === 'ready' ? releaseAvailability(state.summary, releaseId) : state, [
		state,
		releaseId,
	]);
}
