import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getDeploymentQueryOptions } from '@/integrations/api/instance/deployments/getDeployment';
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { useQuery } from '@tanstack/react-query';
import { releasedId } from '../functions/releaseCoverage';
import { releaseOffer } from '../functions/releaseOffer';
import { useReleaseCheck } from '../hooks/useComponentReleases';
import { ActivateRelease } from './ActivateRelease';
import { ReleaseCheckNote } from './ReleaseCheckNote';

/** Needs `list_releases`: unlike a stage, nothing in the records says a node still keeps a release it once ran. */
export function ReleasedRecordDetail({ deployment }: { deployment: Deployment }) {
	const instanceParams = useInstanceClientIdParams();
	const releaseId = releasedId(deployment);
	const check = useReleaseCheck(deployment.project, releaseId);
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
			<ReleaseCheckNote
				project={deployment.project}
				check={check}
				record={builtByOther ? builtBy : deployment}
				trustRecords={false}
			/>
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
