import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { isLocalStudio } from '@/config/constants';
import { ApplicationURL } from '@/features/instance/config/overview/components/ApplicationURL';
import { HarperVersion } from '@/features/instance/config/overview/components/HarperVersion';
import { InstanceNodeName } from '@/features/instance/config/overview/components/InstanceNodeName';
import { InstanceURL } from '@/features/instance/config/overview/components/InstanceURL';
import { useUpdateRestartInstance } from '@/features/instance/operations/mutations/updateRestartInstance';
import { getConfigurationQueryOptions } from '@/features/instance/operations/queries/getConfiguration';
import { getInstanceInfoQueryOptions } from '@/features/instance/operations/queries/getInstanceInfoQuery';
import { getRegistrationInfoQueryOptions } from '@/features/instance/operations/queries/getRegistrationInfo';
import Editor from '@monaco-editor/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { ReactNode } from 'react';
import { toast } from 'sonner';

const LocalStudioOverview = ({ children }: { children: ReactNode }) => {
	return <>{children}</>;
};

const CloudStudioOverview = ({ children }: { children: ReactNode }) => {
	return <>{children}</>;
};

export function ConfigOverviewIndex() {
	const { clusterId, instanceId } = useParams({ strict: false });
	const targetId = instanceId ?? clusterId;
	const targetNoun = instanceId ? 'Instance' : 'Cluster';

	const { mutate: restartInstance, isPending: isRestartInstancePending } = useUpdateRestartInstance();
	const { data: info, isLoading: loadingInstanceInfo } = useSuspenseQuery(
		getInstanceInfoQueryOptions(clusterId, instanceId),
	);
	const clusterInfo = info?.cluster;
	const instanceInfo = info?.instance;
	const { data: registrationInfo, isLoading: loadingRegistration } = useSuspenseQuery(
		getRegistrationInfoQueryOptions(instanceId),
	);
	const { data: configurationInfo, isLoading: loadingConfig } = useSuspenseQuery(
		getConfigurationQueryOptions(instanceId),
	);


	const restartingInstance = () => {
		const toastId = toast.loading('Restarting', {
			description: `Restarting ${targetNoun.toLowerCase()}. This may take up to 60 seconds.`,
			duration: 60000, // Keep the toast open until dismissed
			action: {
				label: 'Dismiss',
				onClick: () => toast.dismiss(),
			},
		});
		restartInstance(targetId, {
			onSuccess: () => {
				toast.dismiss(toastId);
				toast.success('Success', {
					description: `${targetNoun} restarted!`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			},
			onError: () => {
				toast.error('Error', {
					description: `Failed to restart ${targetNoun.toLowerCase()}.`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			},
		});
	};

	return (
		<div className="h-full flex flex-col">
			{isLocalStudio ? (
				<LocalStudioOverview>
					<dl className="grid grid-cols-1 sm:grid-cols-3">
						<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
							<HarperVersion loadingRegistration={loadingRegistration} registrationInfo={registrationInfo} />
						</div>
						<div className="px-4 pb-4 text-right sm:col-span-1 sm:px-0">
							<Button
								variant="positiveOutline"
								className="ml-4 rounded-full cursor-pointer"
								onClick={restartingInstance}
								disabled={isRestartInstancePending}
							>
								Restart {targetNoun}
							</Button>
						</div>
					</dl>
				</LocalStudioOverview>
			) : (
				<CloudStudioOverview>
					<dl className="flex-none grid grid-cols-1 sm:grid-cols-3">
						<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
							<InstanceURL loadingInstanceInfo={loadingInstanceInfo} clusterInfo={clusterInfo} />
						</div>
						<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
							<ApplicationURL loadingInstanceInfo={loadingInstanceInfo} clusterInfo={clusterInfo} />
						</div>
						<div className="px-4 pb-4 text-right sm:col-span-1 sm:px-0">
							<Button
								variant="positiveOutline"
								className="ml-4 rounded-full cursor-pointer"
								onClick={restartingInstance}
								disabled={isRestartInstancePending}
							>
								Restart {targetNoun}
							</Button>
						</div>
						<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
							<InstanceNodeName loadingInstanceInfo={loadingInstanceInfo} instanceInfo={instanceInfo} />
						</div>

						<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
							<HarperVersion loadingRegistration={loadingRegistration} registrationInfo={registrationInfo} />
						</div>
					</dl>
				</CloudStudioOverview>
			)}

			<h3 className="flex-none font-bold text-sm/6">Instance Config (read only)</h3>
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
