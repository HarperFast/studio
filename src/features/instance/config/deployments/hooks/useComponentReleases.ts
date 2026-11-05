import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useReleaseTrackingAvailable } from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { getDeploymentsQueryOptions } from '@/integrations/api/instance/deployments/listDeployments';
import { getReleasesQueryOptions } from '@/integrations/api/instance/deployments/listReleases';
import { describeError } from '@/react-query/queryClient';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import {
	ReleaseAvailability,
	releaseAvailability,
	ReleasesSummary,
	summarizeReleases,
} from '../functions/releaseCoverage';

/** `unsupported`: older than Harper 5.4.0-alpha.1, or its version is not known yet, so nothing can be asked. */
export type ComponentReleasesState =
	| { kind: 'unsupported' }
	/** `previous`: the answer being replaced, for display only. */
	| { kind: 'checking'; previous?: ReleasesSummary }
	| { kind: 'unreadable'; message: string }
	| { kind: 'ready'; summary: ReleasesSummary };

/**
 * What is live and kept for `project` on each node, from `list_releases`.
 *
 * Asked again whenever the component's newest record changes: a deploy or an activation of it starting, finishing, or
 * reaching another node is what changes what each node holds. An answer being fetched again, or one whose refetch
 * failed, is not offered as current, since it may no longer be.
 */
export function useComponentReleases(project: string | undefined) {
	const instanceParams = useInstanceClientIdParams();
	const supported = useReleaseTrackingAvailable() && !!project;
	const query = useQuery(getReleasesQueryOptions({ ...instanceParams, project: project ?? '', enabled: supported }));
	const { data: newest } = useQuery(
		getDeploymentsQueryOptions({ ...instanceParams, project, limit: 1, enabled: supported, pollWhileOpen: true }),
	);
	const fingerprint = newest
		? `${newest.total}|${newest.deployments[0]?.deployment_id}|${newest.deployments[0]?.status}`
		: undefined;
	const seen = useRef<{ project?: string; fingerprint?: string }>({});
	const { refetch } = query;
	useEffect(() => {
		if (!supported || fingerprint === undefined) {
			return;
		}
		const changed = seen.current.project === project && seen.current.fingerprint !== undefined
			&& seen.current.fingerprint !== fingerprint;
		seen.current = { project, fingerprint };
		if (changed) {
			// Joins a fetch already running for another observer rather than restarting it: the walk runs on every node.
			void refetch({ cancelRefetch: false });
		}
	}, [supported, project, fingerprint, refetch]);

	const { data, error, status, isFetching } = query;
	const state = useMemo<ComponentReleasesState>(() => {
		if (!supported) {
			return { kind: 'unsupported' };
		}
		if (status === 'error') {
			return { kind: 'unreadable', message: describeError(error).message };
		}
		const summary = data && summarizeReleases(data, project!);
		return summary && !isFetching ? { kind: 'ready', summary } : { kind: 'checking', previous: summary };
	}, [supported, data, error, status, isFetching, project]);
	return { state, refetch };
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
