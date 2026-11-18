import { ApplyLicensesButton } from '@/components/ApplyLicensesButton';
import { RestartButton } from '@/components/RestartButton';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getInstanceInfoQueryOptions } from '@/features/cluster/queries/getInstanceInfoQuery';
import { ApplicationURL } from '@/features/instance/config/overview/components/ApplicationURL';
import { ClusterDomainsList } from '@/features/instance/config/overview/components/ClusterDomainsList';
import { HarperVersion } from '@/features/instance/config/overview/components/HarperVersion';
import { InstanceConfigEditor } from '@/features/instance/config/overview/components/InstanceConfigEditor';
import { InstanceNodeName } from '@/features/instance/config/overview/components/InstanceNodeName';
import { InstanceURL } from '@/features/instance/config/overview/components/InstanceURL';
import { LastDeployedTimestamp } from '@/features/instance/config/overview/components/LastDeployedTimestamp';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import {
	APIDirectoryEntry,
	APIFileEntry,
	getComponentsQueryOptions,
} from '@/integrations/api/instance/applications/getComponents';
import {
	getRegistrationInfoQueryOptions,
	RegistrationInfoResponse,
} from '@/integrations/api/instance/status/getRegistrationInfo';
import { getUsageLicensesQueryOptions } from '@/integrations/api/instance/status/getUsageLicenses';
import { keyBy } from '@/lib/keyBy';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { useQuery } from '@tanstack/react-query';
import { useLoaderData, useParams } from '@tanstack/react-router';
import { ReactNode, useMemo } from 'react';

const LocalStudioOverview = ({ children }: { children: ReactNode }) => {
	return <>{children}</>;
};

const CloudStudioOverview = ({ children }: { children: ReactNode }) => {
	return <>{children}</>;
};

export function ConfigOverviewIndex() {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const { data: info, isLoading: loadingInstanceInfo } = useQuery(
		getInstanceInfoQueryOptions({ clusterId, instanceId }),
	);
	const targetNoun = (instanceId || isLocalStudio) ? 'Instance' : 'Cluster';
	const instanceParams = useInstanceClientIdParams();

	const { version }: RegistrationInfoResponse = useLoaderData({ strict: false });
	const checkUsageLicenses = !isLocalStudio && wasAReleasedBeforeB('4.7.0-alpha.1', version);

	const { data: appliedLicenses } = useQuery(
		getUsageLicensesQueryOptions(instanceParams, checkUsageLicenses),
	);
	const clusterInfo = info?.cluster;
	const instanceInfo = info?.instance;
	const { data: registrationInfo, isLoading: loadingRegistration } = useQuery(
		getRegistrationInfoQueryOptions(instanceParams),
	);
	const canManage = useInstanceManagePermission();
	const { data: components, isLoading: loadingComponents } = useQuery(
		getComponentsQueryOptions({ ...instanceParams, enabled: canManage }),
	);

	const lastDeployedTimestamp = useMemo(() => {
		if (!components) { return null; }

		let maxMtime = 0;
		const traverse = (entry: APIDirectoryEntry | APIFileEntry) => {
			if (entry.mtime) {
				maxMtime = Math.max(maxMtime, new Date(entry.mtime).getTime());
			}
			if ('entries' in entry && entry.entries) {
				entry.entries.forEach(traverse);
			}
		};

		traverse(components);
		return maxMtime || null;
	}, [components]);

	const newLicenses = useMemo(() => {
		if (isLocalStudio) {
			return [];
		}
		const cloudLicenses = instanceInfo?.licenses;
		if (appliedLicenses && cloudLicenses) {
			const appliedLicensesById = keyBy(appliedLicenses, 'id');
			return cloudLicenses.filter(cloudLicense => !appliedLicensesById[cloudLicense.id]);
		}
		return [];
	}, [appliedLicenses, instanceInfo]);

	return (
		<div className="h-full flex flex-col">
			{isLocalStudio
				? (
					<LocalStudioOverview>
						<dl className="grid grid-cols-1 sm:grid-cols-3">
							<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
								<HarperVersion loadingRegistration={loadingRegistration} registrationInfo={registrationInfo} />
							</div>
							<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
								<LastDeployedTimestamp loading={loadingComponents} timestamp={lastDeployedTimestamp} />
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
								<InstanceNodeName loadingInstanceInfo={loadingInstanceInfo} instanceInfo={instanceInfo} />
							</div>
							<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
								<HarperVersion loadingRegistration={loadingRegistration} registrationInfo={registrationInfo} />
							</div>
							<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
								<LastDeployedTimestamp loading={loadingComponents} timestamp={lastDeployedTimestamp} />
							</div>
							<div className="px-4 pb-4 text-right sm:col-span-1 sm:px-0 grid gap-1">
								{newLicenses?.length > 0 && <ApplyLicensesButton newLicenses={newLicenses} />}
								<RestartButton
									targetNoun={targetNoun}
									instanceClient={instanceParams.instanceClient}
									operation="restart"
								/>
							</div>
							<div className="px-4 pb-4 sm:col-span-3 sm:px-0">
								<InstanceURL loadingInstanceInfo={loadingInstanceInfo} instanceInfo={instanceInfo} />
							</div>
							<div className="px-4 pb-4 sm:col-span-3 sm:px-0">
								<ApplicationURL loadingInstanceInfo={loadingInstanceInfo} clusterInfo={clusterInfo} />
							</div>
							{clusterInfo?.domains?.length && (
								<div className="px-4 pb-4 sm:col-span-3 sm:px-0">
									<ClusterDomainsList loadingInstanceInfo={loadingInstanceInfo} clusterInfo={clusterInfo} />
								</div>
							)}
						</dl>
					</CloudStudioOverview>
				)}

			<InstanceConfigEditor
				targetNoun={targetNoun}
				clusterInfo={clusterInfo}
				version={version ?? registrationInfo?.version}
				readsOneInstanceOfMany={!instanceId && !isLocalStudio}
			/>
		</div>
	);
}
