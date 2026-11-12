import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getDeploymentQueryOptions } from '@/integrations/api/instance/deployments/getDeployment';
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { useQuery } from '@tanstack/react-query';
import { releasedId } from '../functions/releaseCoverage';
import { releaseOffer } from '../functions/releaseOffer';
import { useRecheckRelease, useReleaseCheck } from '../hooks/useComponentReleases';
import { ActivateRelease } from './ActivateRelease';
import { ReleaseCheckNote } from './ReleaseCheckNote';

/**
 * Needs `list_releases`: unlike a stage, nothing in the records says a node still keeps a release it once ran. A
 * failed deploy may still be live on the node that received it, or held elsewhere (`../functions/stagedRelease.ts`).
 */
export function ReleasedRecordDetail({ deployment }: { deployment: Deployment }) {
	const instanceParams = useInstanceClientIdParams();
	const releaseId = releasedId(deployment);
	const check = useReleaseCheck(deployment.project, releaseId);
	const recheck = useRecheckRelease(deployment.project, releaseId);
	const builtByOther = releaseId !== deployment.deployment_id;
	const { data: builtBy } = useQuery({
		...getDeploymentQueryOptions({ ...instanceParams, deploymentId: releaseId }),
		enabled: builtByOther
			&& (check.kind === 'missing' || (check.kind === 'available' && deployment.routing === undefined)),
	});
	const failed = deployment.status === 'failed';
	// Its error already says why it failed; with every node saying it holds none there is nothing to offer.
	if (
		check.kind === 'unsupported'
		|| (failed && check.kind === 'missing' && !check.held && check.missing.length > 0 && check.unreadable.length === 0)
	) {
		return null;
	}
	const { intent, offer, disabled } = releaseOffer(
		check,
		{ intent: failed ? 'again' : 'rollback', offer: true },
		false,
	);
	return (
		<>
			<ReleaseCheckNote
				check={check}
				record={builtByOther ? builtBy : deployment}
			/>
			<ActivateRelease
				project={deployment.project}
				releaseId={releaseId}
				intent={intent}
				offer={offer}
				disabled={disabled}
				revalidate={recheck}
				routing={deployment.routing === undefined ? builtBy?.routing : deployment.routing}
			/>
		</>
	);
}
