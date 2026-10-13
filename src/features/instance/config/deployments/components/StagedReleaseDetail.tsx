import { Deployment } from '@/integrations/api/instance/deployments/types';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';
import { useMemo } from 'react';
import { StagedReleaseState } from '../functions/stagedRelease';
import { useStagedReleases } from '../hooks/useStagedReleases';
import { ActivateStagedRelease } from './ActivateStagedRelease';
import { DeploymentLink } from './StagedReleaseNote';

const ago = (ms: number) => translateSecondsToAgo((Date.now() - ms) / 1000, ms);

function UncertainRelease({ release }: { release: Extract<StagedReleaseState, { kind: 'uncertain' }> }) {
	const { activation, failed } = release;
	if (!activation) {
		return (
			<>
				Its activation,{' '}
				<DeploymentLink deployment={failed} />, failed. Depending on where it failed, it may be live on some nodes.
				Activating it again retries it.
			</>
		);
	}
	return (
		<>
			Activated by <DeploymentLink deployment={activation} />, {failed === activation
				? 'but some nodes did not take it'
				: (
					<>
						but a later deploy, <DeploymentLink deployment={failed} />, failed and may have gone live on some nodes
					</>
				)}, so it may not be live everywhere. Activating it again puts it back wherever it is missing.
		</>
	);
}

export function StagedReleaseDetail({ deployment }: { deployment: Deployment }) {
	const records = useMemo(() => [deployment], [deployment]);
	const release = useStagedReleases(records).get(deployment.deployment_id);

	return (
		<>
			<div className="text-sm text-muted-foreground">
				{!release && 'Staged. Checking whether it has been activated…'}
				{release?.kind === 'waiting'
					&& 'Staged: built and installed, but not live. Activating it makes it live with nothing to install.'}
				{release?.kind === 'unknown'
					&& "Staged. Couldn't read the deployments since, so it may already be live: activating a live release restarts every node without changing anything."}
				{release?.kind === 'activating' && (
					<>
						Being activated by <DeploymentLink deployment={release.activation} />, which{' '}
						{release.activation.started_at ? `started ${ago(release.activation.started_at)} and ` : ''}has not finished.
						While it runs, activating it again starts a second rolling restart. If it stopped without finishing,
						activate it again.
					</>
				)}
				{release?.kind === 'live' && (
					<>
						Live: activated by <DeploymentLink deployment={release.activation} />, and no other deploy of{' '}
						{deployment.project} has finished since, so there is nothing to activate.
					</>
				)}
				{release?.kind === 'replaced' && (
					<>
						Activated by <DeploymentLink deployment={release.activation} />, then replaced by{' '}
						<DeploymentLink deployment={release.replacedBy} />. Activating it again rolls {deployment.project}{' '}
						back to this release.
					</>
				)}
				{release?.kind === 'uncertain' && <UncertainRelease release={release} />}
			</div>
			{/* Mounted in every state, so the progress of an activation started here outlives the button it hides. */}
			<ActivateStagedRelease
				deployment={deployment}
				intent={release?.kind === 'replaced'
					? 'rollback'
					: release?.kind === 'uncertain' || release?.kind === 'activating'
					? 'again'
					: 'activate'}
				offer={release !== undefined && release.kind !== 'live'}
			/>
		</>
	);
}
