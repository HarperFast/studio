import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useReleaseTrackingAvailable } from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { getDeploymentsQueryOptions } from '@/integrations/api/instance/deployments/listDeployments';
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';
import { describeError } from '@/react-query/queryClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { shortDeploymentId } from '../functions/deploymentSource';
import { releaseOffer } from '../functions/releaseOffer';
import { rolloutOfAnother, StagedReleaseState } from '../functions/stagedRelease';
import { useRecheckRelease, useReleaseCheck } from '../hooks/useComponentReleases';
import { useStagedReleases } from '../hooks/useStagedReleases';
import { type ActivateAnyway, ActivateRelease } from './ActivateRelease';
import { ReleaseCheckNote } from './ReleaseCheckNote';
import { DeploymentLink } from './StagedReleaseNote';

const ago = (ms: number) => translateSecondsToAgo((Date.now() - ms) / 1000, ms);

/** A staged record with no start time has its whole history read, so nothing began before it. */
const startedBefore = (record: Deployment, staged: Deployment) =>
	staged.started_at !== undefined && (record.started_at ?? 0) < staged.started_at;

function UncertainRelease(
	{ release, advise }: { release: Extract<StagedReleaseState, { kind: 'uncertain' }>; advise: boolean },
) {
	const { activation, failed } = release;
	if (!activation) {
		return (
			<>
				Its activation,{' '}
				<DeploymentLink deployment={failed} />, failed. Depending on where it failed, it may be live on some nodes.
				{advise && ' Activating it again retries it.'}
			</>
		);
	}
	return (
		<>
			Activated by <DeploymentLink deployment={activation} />, {failed === activation
				? 'but some nodes did not take it'
				: (
					<>
						but a later deploy, <DeploymentLink deployment={failed} />, {failed.status === 'partial'
							? 'went live on only some nodes'
							: 'failed and may have gone live on some nodes'}
					</>
				)}, so it may not be live everywhere.{advise && ' Activating it again puts it back wherever it is missing.'}
		</>
	);
}

export function StagedReleaseDetail({ deployment }: { deployment: Deployment }) {
	const records = useMemo(() => [deployment], [deployment]);
	const release = useStagedReleases(records).get(deployment.deployment_id);
	const instanceParams = useInstanceClientIdParams();
	const queryClient = useQueryClient();
	const rolloutsAsked = useReleaseTrackingAvailable();
	const rolloutsQuery = useMemo(() => ({
		...getDeploymentsQueryOptions({
			...instanceParams,
			project: deployment.project,
			status: 'rolling_out',
			pollWhileOpen: true,
			enabled: rolloutsAsked,
		}),
		meta: { reportsOwnFailure: true },
	}), [instanceParams, deployment.project, rolloutsAsked]);
	const { data: rollingOut, error: rollingOutError, status: rolloutsStatus } = useQuery(rolloutsQuery);
	// The records above start at this release, so this list adds the rollouts that began before it; once those
	// records are read, they decide for every rollout from it on, which keeps a stale list from reviving one.
	const historyRead = release !== undefined && release.kind !== 'unknown';
	const rollout = rolloutOfAnother(deployment, [
		...(release?.rollout ? [release.rollout] : []),
		...(rollingOut?.deployments ?? []).filter((record) => !historyRead || startedBefore(record, deployment)),
	]);
	// A list whose latest read failed may be missing a rollout that has started since.
	const rolloutsUnread = rolloutsAsked && rolloutsStatus !== 'success';
	const check = useReleaseCheck(deployment.project, deployment.deployment_id);
	const recheck = useRecheckRelease(deployment.project, deployment.deployment_id);
	const offered = releaseOffer(check, {
		intent: release?.kind === 'replaced'
			? 'rollback'
			: release?.kind === 'uncertain' || release?.kind === 'activating'
			? 'again'
			: 'activate',
		offer: release !== undefined && release.kind !== 'live',
	}, true);
	const { intent } = offered;
	const offer = offered.offer && !rollout;
	// Disabling, not only hiding, also refuses the retry of an activation that failed here.
	const disabled = offered.disabled || rollout !== undefined || rolloutsUnread;
	// Once the nodes can be asked, their note alone says what to do; the records only tell what happened.
	const advise = check.kind === 'unsupported';
	const adviseActivating = advise && !rollout;
	// Harper ends a rollout's record when its job fails or when the node that received it next boots, so one whose node
	// never returns reads `rolling_out` for good, and nothing here tells it from one still running. A person may know:
	// they can activate past it, warned, but only past the rollout; a node that holds no copy still refuses.
	const anyway: ActivateAnyway | undefined = offered.offer && rollout
		? {
			warning: (
				<>
					Deployment <span className="font-mono">{shortDeploymentId(rollout.deployment_id)}</span>{' '}
					{rollout.started_at ? `started rolling out ${ago(rollout.started_at)} and` : ''}{' '}
					still reads as rolling out. If it is still running, this starts a second rolling activation alongside it, and
					nodes can end on different releases. Go ahead only if you know it stopped: Harper leaves the record rolling
					out for good when the node that received it never comes back.
				</>
			),
			disabled: offered.disabled,
			revalidate: advise ? undefined : recheck,
		}
		: undefined;
	// A rollout can start between the last poll and the confirmation, which decides on this answer, not on the props.
	const revalidate = useCallback(async () => {
		const nodesAllow = await recheck();
		const { deployments } = await queryClient.fetchQuery(rolloutsQuery);
		return nodesAllow && !rolloutOfAnother(deployment, deployments);
	}, [recheck, queryClient, rolloutsQuery, deployment]);
	// Where the records and the nodes disagree about where it is live, the nodes are right and the note says so alone.
	const recordsContradicted = check.kind === 'live-everywhere'
		? release?.kind !== 'live'
		: (check.kind === 'available' || check.kind === 'missing')
			&& (release?.kind === 'live'
				|| (check.liveOn.length > 0 && (release?.kind === 'waiting' || release?.kind === 'replaced')));

	return (
		<>
			{!recordsContradicted && (
				<div className="text-sm text-muted-foreground">
					{!release && 'Staged. Checking whether it has been activated…'}
					{release?.kind === 'waiting' && (
						<>
							Staged: built and installed, but not live.
							{adviseActivating && ' Activating it just switches each node to it.'}
						</>
					)}
					{release?.kind === 'unknown' && (
						<>
							Staged. Couldn&apos;t read the deployments since{adviseActivating
								? ', so it may already be live: activating a live release restarts every node without changing anything.'
								: '.'}
						</>
					)}
					{release?.kind === 'activating' && (
						<>
							Being activated by <DeploymentLink deployment={release.activation} />, which{' '}
							{release.activation.started_at ? `started ${ago(release.activation.started_at)} and ` : ''}has not
							finished. While it runs, activating it again starts a second rolling restart.
							{adviseActivating && ' If it stopped without finishing, activate it again.'}
						</>
					)}
					{release?.kind === 'live' && (
						<>
							Live: activated by <DeploymentLink deployment={release.activation} />, and no other deploy of{' '}
							{deployment.project} has finished since{advise ? ', so there is nothing to activate.' : '.'}
						</>
					)}
					{release?.kind === 'being-replaced' && (
						<>
							Activated by <DeploymentLink deployment={release.activation} />, but a later deploy,{' '}
							<DeploymentLink deployment={release.replacedBy} />, is taking over: it went live on the node that received
							it and is reaching the other nodes one at a time.
						</>
					)}
					{release?.kind === 'replaced' && (
						<>
							Activated by <DeploymentLink deployment={release.activation} />, then replaced by{' '}
							<DeploymentLink deployment={release.replacedBy} />.
							{adviseActivating && ` Activating it again rolls ${deployment.project} back to this release.`}
						</>
					)}
					{release?.kind === 'uncertain' && <UncertainRelease release={release} advise={adviseActivating} />}
				</div>
			)}
			{/* Outside the records' note, which the nodes' answer can hide. */}
			{offered.offer && rollout && (
				<p className="text-sm text-muted-foreground">
					Until <DeploymentLink deployment={rollout} />{' '}
					finishes rolling out, activating this release would start a second rolling activation alongside it, so it
					isn&apos;t offered.{rollout.started_at ? ` It started ${ago(rollout.started_at)}.` : ''}
				</p>
			)}
			{offered.offer && !rollout && rolloutsAsked && rollingOutError && (
				<p className="text-sm text-muted-foreground">
					Couldn&apos;t ask whether another deploy of {deployment.project} is rolling out:{' '}
					{describeError(rollingOutError).message} Activation stays disabled until that can be read.
				</p>
			)}
			<ReleaseCheckNote
				check={check}
				record={deployment}
				showLive={release?.kind !== 'live'}
				adviseActivating={!rollout}
			/>
			{/* Mounted in every state, so the progress of an activation started here outlives the button it hides. */}
			<ActivateRelease
				project={deployment.project}
				releaseId={deployment.deployment_id}
				intent={intent}
				offer={offer}
				disabled={disabled}
				revalidate={advise ? undefined : revalidate}
				anyway={anyway}
				routing={deployment.routing}
			/>
		</>
	);
}
