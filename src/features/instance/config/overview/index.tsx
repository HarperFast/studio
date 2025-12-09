import { ApplyLicensesButton } from '@/components/ApplyLicensesButton';
import { RestartButton } from '@/components/RestartButton';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getInstanceInfoQueryOptions } from '@/features/cluster/queries/getInstanceInfoQuery';
import { ApplicationURL } from '@/features/instance/config/overview/components/ApplicationURL';
import { HarperVersion } from '@/features/instance/config/overview/components/HarperVersion';
import { InstanceNodeName } from '@/features/instance/config/overview/components/InstanceNodeName';
import { InstanceURL } from '@/features/instance/config/overview/components/InstanceURL';
import { Instance } from '@/integrations/api/api.patch';
import { getConfigurationQueryOptions } from '@/integrations/api/instance/status/getConfiguration';
import {
	getRegistrationInfoQueryOptions,
	RegistrationInfoResponse,
} from '@/integrations/api/instance/status/getRegistrationInfo';
import { getUsageLicensesQueryOptions } from '@/integrations/api/instance/status/getUsageLicenses';
import { keyBy } from '@/lib/keyBy';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import Editor from '@monaco-editor/react';
import { useQuery } from '@tanstack/react-query';
import { useLoaderData, useParams, useRouteContext } from '@tanstack/react-router';
import { ReactNode, useMemo } from 'react';

const LocalStudioOverview = ({ children }: { children: ReactNode }) => {
	return <>{children}</>;
};

const CloudStudioOverview = ({ children }: { children: ReactNode }) => {
	return <>{children}</>;
};

export function ConfigOverviewIndex() {
	const { clusterId, instanceId }: { instanceId?: string; clusterId: string } = useParams({ strict: false });
	const { instance: cloudInstance }: { instance?: Instance } = useRouteContext({ strict: false });
	const targetNoun = (instanceId || isLocalStudio) ? 'Instance' : 'Cluster';
	const instanceParams = useInstanceClientIdParams();

	const { version }: RegistrationInfoResponse = useLoaderData({ strict: false });
	const checkUsageLicenses = !isLocalStudio && wasAReleasedBeforeB('4.7.0-alpha.1', version);

	const { data: info, isLoading: loadingInstanceInfo } = useQuery(
		getInstanceInfoQueryOptions({ clusterId, instanceId }),
	);
	const { data: appliedLicenses } = useQuery(
		getUsageLicensesQueryOptions(instanceParams, checkUsageLicenses),
	);
	const clusterInfo = info?.cluster;
	const instanceInfo = info?.instance;
	const { data: registrationInfo, isLoading: loadingRegistration } = useQuery(
		getRegistrationInfoQueryOptions(instanceParams),
	);
	const { data: configurationInfo, isLoading: loadingConfig } = useQuery(
		getConfigurationQueryOptions(instanceParams),
	);

	const newLicenses = useMemo(() => {
		if (clusterId && !instanceId) {
			// We won't check the licenses when running through a load balancer.
			return [];
		}
		if (appliedLicenses && cloudInstance?.licenses) {
			const appliedLicensesById = keyBy(appliedLicenses, 'id');
			return cloudInstance.licenses.filter(cloudLicense => !appliedLicensesById[cloudLicense.id]);
		}
		return [];
	}, [clusterId, instanceId, appliedLicenses, cloudInstance]);

	return (
		<div className="h-full flex flex-col">
			{isLocalStudio
				? (
					<LocalStudioOverview>
						<dl className="grid grid-cols-1 sm:grid-cols-3">
							<div className="px-4 pb-4 sm:col-span-2 sm:px-0">
								<HarperVersion loadingRegistration={loadingRegistration} registrationInfo={registrationInfo} />
							</div>
							<div className="px-4 pb-4 text-right sm:col-span-1 sm:px-0">
								<RestartButton
									targetNoun={targetNoun}
									instanceClient={instanceParams.instanceClient}
									operation="restart"
								/>
							</div>
						</dl>
					</LocalStudioOverview>
				)
				: (
					<CloudStudioOverview>
						<dl className="flex-none grid grid-cols-1 sm:grid-cols-4">
							<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
								<HarperVersion loadingRegistration={loadingRegistration} registrationInfo={registrationInfo} />
							</div>
							<div className="px-4 pb-4 sm:col-span-2 sm:px-0">
								<InstanceURL loadingInstanceInfo={loadingInstanceInfo} instanceInfo={instanceInfo} />
							</div>
							<div className="px-4 pb-4 text-right sm:col-span-1 sm:px-0 grid gap-1">
								{newLicenses?.length > 0 && <ApplyLicensesButton newLicenses={newLicenses} />}
								<RestartButton
									targetNoun={targetNoun}
									instanceClient={instanceParams.instanceClient}
									operation="restart"
								/>
							</div>
							<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
								<InstanceNodeName loadingInstanceInfo={loadingInstanceInfo} instanceInfo={instanceInfo} />
							</div>
							<div className="px-4 pb-4 sm:col-span-2 sm:px-0">
								<ApplicationURL loadingInstanceInfo={loadingInstanceInfo} clusterInfo={clusterInfo} />
							</div>
						</dl>
					</CloudStudioOverview>
				)}

			<h3 className="flex-none font-bold text-sm/6">Instance Config (read only)</h3>
			{!instanceId && (
				<p className="text-muted-foreground italic text-sm mb-2">
					You are viewing the config for one instance in your cluster, based on what the load balancer selected for you.
				</p>
			)}
			<div className="grow">
				{!loadingConfig
					? (
						<Editor
							className="w-full min-h-full h-96"
							language="json"
							theme="vs-dark"
							options={{ readOnly: true, scrollBeyondLastLine: false }}
							value={JSON.stringify(configurationInfo, null, 4)}
						/>
					)
					: (
						<>
							<TextLoadingSkeleton className="w-full" />
							<TextLoadingSkeleton className="w-full" />
							<TextLoadingSkeleton className="w-1/2" />
						</>
					)}
			</div>
		</div>
	);
}
