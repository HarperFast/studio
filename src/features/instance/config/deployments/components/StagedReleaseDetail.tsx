import { Deployment } from '@/integrations/api/instance/deployments/types';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';
import { useMemo } from 'react';
import { releaseOffer } from '../functions/releaseOffer';
import { StagedReleaseState } from '../functions/stagedRelease';
import { useReleaseCheck } from '../hooks/useComponentReleases';
import { useStagedReleases } from '../hooks/useStagedReleases';
import { ActivateRelease } from './ActivateRelease';
import { ReleaseCheckNote } from './ReleaseCheckNote';
import { DeploymentLink } from './StagedReleaseNote';

const ago = (ms: number) => translateSecondsToAgo((Date.now() - ms) / 1000, ms);

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
	const check = useReleaseCheck(deployment.project, deployment.deployment_id);
	const { intent, offer, disabled } = releaseOffer(check, {
		intent: release?.kind === 'replaced'
			? 'rollback'
			: release?.kind === 'uncertain' || release?.kind === 'activating'
			? 'again'
			: 'activate',
		offer: release !== undefined && release.kind !== 'live',
	}, true);
	// Once the nodes can be asked, their note alone says what to do; the records only tell what happened.
	const advise = check.kind === 'unsupported';
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
							{advise && ' Activating it just switches each node to it.'}
						</>
					)}
					{release?.kind === 'unknown' && (
						<>
							Staged. Couldn&apos;t read the deployments since{advise
								? ', so it may already be live: activating a live release restarts every node without changing anything.'
								: '.'}
						</>
					)}
					{release?.kind === 'activating' && (
						<>
							Being activated by <DeploymentLink deployment={release.activation} />, which{' '}
							{release.activation.started_at ? `started ${ago(release.activation.started_at)} and ` : ''}has not
							finished. While it runs, activating it again starts a second rolling restart.
							{advise && ' If it stopped without finishing, activate it again.'}
						</>
					)}
					{release?.kind === 'live' && (
						<>
							Live: activated by <DeploymentLink deployment={release.activation} />, and no other deploy of{' '}
							{deployment.project} has finished since{advise ? ', so there is nothing to activate.' : '.'}
						</>
					)}
					{release?.kind === 'replaced' && (
						<>
							Activated by <DeploymentLink deployment={release.activation} />, then replaced by{' '}
							<DeploymentLink deployment={release.replacedBy} />.
							{advise && ` Activating it again rolls ${deployment.project} back to this release.`}
						</>
					)}
					{release?.kind === 'uncertain' && <UncertainRelease release={release} advise={advise} />}
				</div>
			)}
			<ReleaseCheckNote
				check={check}
				record={deployment}
				showLive={release?.kind !== 'live'}
			/>
			{/* Mounted in every state, so the progress of an activation started here outlives the button it hides. */}
			<ActivateRelease
				project={deployment.project}
				releaseId={deployment.deployment_id}
				intent={intent}
				offer={offer}
				disabled={disabled}
			/>
		</>
	);
}
