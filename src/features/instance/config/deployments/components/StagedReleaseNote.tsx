import { deploymentRecordPath } from '@/features/instance/applications/hooks/useDeploymentRecordAction';
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { Link, useParams } from '@tanstack/react-router';
import { shortDeploymentId } from '../functions/deploymentSource';
import { StagedReleaseState } from '../functions/stagedRelease';

export function DeploymentLink({ deployment }: { deployment: Deployment }) {
	const params: { clusterId?: string; instanceId?: string; organizationId?: string } = useParams({ strict: false });
	return (
		<Link
			to={deploymentRecordPath(params, deployment.deployment_id)}
			title={deployment.deployment_id}
			className="font-mono underline"
			// In a list row, which opens the row's own record on click.
			onClick={(event) => event.stopPropagation()}
		>
			{shortDeploymentId(deployment.deployment_id)}
		</Link>
	);
}

export function StagedReleaseNote({ release }: { release: StagedReleaseState | undefined }) {
	if (!release || release.kind === 'unknown') {
		return null;
	}
	return (
		<span className="text-xs text-muted-foreground">
			{release.kind === 'waiting' && 'waiting to be activated'}
			{release.kind === 'activating' && (
				<>
					being activated by <DeploymentLink deployment={release.activation} />
				</>
			)}
			{release.kind === 'live' && (
				<>
					live, activated by <DeploymentLink deployment={release.activation} />
				</>
			)}
			{release.kind === 'replaced' && (
				<>
					activated by <DeploymentLink deployment={release.activation} />, replaced by{' '}
					<DeploymentLink deployment={release.replacedBy} />
				</>
			)}
			{release.kind === 'uncertain' && (release.activation
				? (
					<>
						activated by <DeploymentLink deployment={release.activation} />, may not be live everywhere
					</>
				)
				: (
					<>
						activation <DeploymentLink deployment={release.failed} /> failed
					</>
				))}
		</span>
	);
}
