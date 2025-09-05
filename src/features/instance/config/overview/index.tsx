import { RestartButton } from '@/components/RestartButton';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getInstanceInfoQueryOptions } from '@/features/cluster/queries/getInstanceInfoQuery';
import { ApplicationURL } from '@/features/instance/config/overview/components/ApplicationURL';
import { HarperVersion } from '@/features/instance/config/overview/components/HarperVersion';
import { InstanceNodeName } from '@/features/instance/config/overview/components/InstanceNodeName';
import { InstanceURL } from '@/features/instance/config/overview/components/InstanceURL';
import { getConfigurationQueryOptions } from '@/features/instance/operations/queries/getConfiguration';
import { getRegistrationInfoQueryOptions } from '@/features/instance/operations/queries/getRegistrationInfo';
import Editor from '@monaco-editor/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { ReactNode } from 'react';

const LocalStudioOverview = ({ children }: { children: ReactNode }) => {
	return <>{children}</>;
};

const CloudStudioOverview = ({ children }: { children: ReactNode }) => {
	return <>{children}</>;
};

export function ConfigOverviewIndex() {
	const { clusterId, instanceId }: { instanceId?: string; clusterId: string; } = useParams({ strict: false });
	const targetNoun = (instanceId || isLocalStudio) ? 'Instance' : 'Cluster';
	const instanceParams = useInstanceClientIdParams();

	const { data: info, isLoading: loadingInstanceInfo } = useSuspenseQuery(
		getInstanceInfoQueryOptions({ clusterId, instanceId }),
	);
	const clusterInfo = info?.cluster;
	const instanceInfo = info?.instance;
	const { data: registrationInfo, isLoading: loadingRegistration } = useSuspenseQuery(
		getRegistrationInfoQueryOptions(instanceParams),
	);
	const { data: configurationInfo, isLoading: loadingConfig } = useSuspenseQuery(
		getConfigurationQueryOptions(instanceParams),
	);

	return (
		<div className="h-full flex flex-col">
			{isLocalStudio ? (
				<LocalStudioOverview>
					<dl className="grid grid-cols-1 sm:grid-cols-3">
						<div className="px-4 pb-4 sm:col-span-2 sm:px-0">
							<HarperVersion loadingRegistration={loadingRegistration} registrationInfo={registrationInfo} />
						</div>
						<div className="px-4 pb-4 text-right sm:col-span-1 sm:px-0">
							<RestartButton targetNoun={targetNoun} instanceClient={instanceParams.instanceClient} operation="restart" />
						</div>
					</dl>
				</LocalStudioOverview>
			) : (
				<CloudStudioOverview>
					<dl className="flex-none grid grid-cols-1 sm:grid-cols-4">
						<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
							<HarperVersion loadingRegistration={loadingRegistration} registrationInfo={registrationInfo} />
						</div>
						<div className="px-4 pb-4 sm:col-span-2 sm:px-0">
							<InstanceURL loadingInstanceInfo={loadingInstanceInfo} instanceInfo={instanceInfo} />
						</div>
						<div className="px-4 pb-4 text-right sm:col-span-1 sm:px-0">
							<RestartButton targetNoun={targetNoun} instanceClient={instanceParams.instanceClient} operation="restart" />
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
					You are viewing the config for one instance in your cluster, based on what the load balancer
					selected for you.</p>)}
			<div className="grow">
				{!loadingConfig ? (
					<Editor
						className="w-full min-h-full h-96"
						language="json"
						theme="vs-dark"
						options={{ readOnly: true, scrollBeyondLastLine: false }}
						value={JSON.stringify(configurationInfo, null, 4)}
					/>
				) : (
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
