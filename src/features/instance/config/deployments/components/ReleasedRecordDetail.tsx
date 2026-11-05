import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getDeploymentQueryOptions } from '@/integrations/api/instance/deployments/getDeployment';
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { useQuery } from '@tanstack/react-query';
import { releasedId } from '../functions/releaseCoverage';
import { releaseOffer } from '../functions/releaseOffer';
import { useReleaseCheck } from '../hooks/useComponentReleases';
import { ActivateRelease } from './ActivateRelease';
import { ReleaseCheckNote } from './ReleaseCheckNote';

/**
 * Going back to the release a deploy or an activation made live (HarperFast/studio#1232). Offered only where Harper
 * can say each node keeps it (5.4.0-alpha.1+): unlike a staged release, nothing in the records says a node still holds
 * a release it once ran, and one that does not refuses the activation.
 */
export function ReleasedRecordDetail({ deployment }: { deployment: Deployment }) {
	const instanceParams = useInstanceClientIdParams();
	const releaseId = releasedId(deployment);
	const check = useReleaseCheck(deployment.project, releaseId);
	// Only the deployment that built a release can say why a node has none of it.
	const builtByOther = releaseId !== deployment.deployment_id;
	const { data: builtBy } = useQuery({
		...getDeploymentQueryOptions({ ...instanceParams, deploymentId: releaseId }),
		enabled: builtByOther && check.kind === 'missing',
	});
	if (check.kind === 'unsupported') {
		return null;
	}
	const { intent, offer, disabled } = releaseOffer(check, { intent: 'rollback', offer: true }, false);
	return (
		<>
			<ReleaseCheckNote check={check} record={builtByOther ? builtBy : deployment} trustRecords={false} />
			<ActivateRelease
				project={deployment.project}
				releaseId={releaseId}
				intent={intent}
				offer={offer}
				disabled={disabled}
			/>
		</>
	);
}
