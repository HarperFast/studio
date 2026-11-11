import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { isPrivateAudience } from '@/features/instance/config/githubActions/actionsAudience';
import { Cluster, Instance } from '@/integrations/api/api.patch';
import { supportsCiDeploy } from '@/integrations/api/instance/ciDeploy/ciDeploy';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { useQuery } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';

/**
 * The cluster a project made with the Harper CLI deploys to, and whether it ends with create-harper's GitHub Actions
 * outro (`ciDeploy`): `undefined` until the cluster's version is known. An unreadable version deploys from the laptop;
 * a private address, Local Studio's included, too.
 */
export function useCiDeployOutro(): { target: string | null | undefined; ciDeploy: boolean | undefined } {
	const instanceParams = useInstanceClientIdParams();
	const { instance, cluster }: { instance?: Instance; cluster?: Cluster } = useRouteContext({ strict: false });
	const { data: registrationInfo, isPending } = useQuery(getRegistrationInfoQueryOptions(instanceParams));
	const target = isLocalStudio
		? instanceParams.instanceClient.defaults.baseURL
		: instance
		? getOperationsUrlForInstance(instance)
		: getOperationsUrlForCluster(cluster);
	const ciDeploy = isPending
		? undefined
		: !isLocalStudio && !(target && isPrivateAudience(target)) && supportsCiDeploy(registrationInfo?.version);
	return { target, ciDeploy };
}
