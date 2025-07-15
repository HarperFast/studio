import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { toast } from 'sonner';
import { getRegistrationInfoQueryOptions } from '@/features/instance/operations/queries/getRegistrationInfo';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getConfigurationQueryOptions } from '@/features/instance/operations/queries/getConfiguration';
import Editor from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { RemoveInstanceModal } from '../../modals/RemoveInstanceModal';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { useDeleteInstance } from '@/features/cluster/hooks/useDeleteInstance';
import { getInstanceInfoQueryOptions } from '@/features/instance/operations/queries/getInstanceInfoQuery';
import { useHumanFileSize } from '@/hooks/useHumanFileSize';
import { useUpdateRestartInstance } from '../../operations/mutations/updateRestartInstance';

export function ConfigOverviewIndex() {
	const { clusterId, instanceId } = useParams({ strict: false });
	const { mutate: deleteInstance, isPending: isDeleteInstancePending } = useDeleteInstance();
	const [isRemoveInstanceModalOpen, setIsRemoveInstanceModalOpen] = useState(false);
	const { mutate: restartInstance, isPending: isRestartInstancePending } = useUpdateRestartInstance();
	const { data: info, isLoading: loadingInstanceInfo } = useSuspenseQuery(
		getInstanceInfoQueryOptions(clusterId, instanceId)
	);
	const clusterInfo = info?.cluster;
	const instanceInfo = info?.instance;
	const { data: registrationInfo, isLoading: loadingRegistration } = useSuspenseQuery(
		getRegistrationInfoQueryOptions(instanceId)
	);
	const { data: configurationInfo, isLoading: loadingConfig } = useSuspenseQuery(
		getConfigurationQueryOptions(instanceId)
	);

	const restartingInstance = () => {
		if (!instanceId) {
			return;
		}
		const toastId = toast.loading('Restarting', {
			description: 'Restarting instance. This may take up to 60 seconds.',
			duration: 60000, // Keep the toast open until dismissed
			action: {
				label: 'Dismiss',
				onClick: () => toast.dismiss(),
			},
		});
		restartInstance(instanceId, {
			onSuccess: () => {
				toast.dismiss(toastId);
				toast.success('Success', {
					description: `Instance restarted!`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			},
			onError: () => {
				toast.error('Error', {
					description: `Failed to restart instance.`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			},
		});
	};

	const ramAllocation = useHumanFileSize(registrationInfo?.ram_allocation, 1024 * 1024);

	const submitInstanceRemoval = () => {
		if (!instanceId) {
			return;
		}
		deleteInstance(instanceId, {
			onSuccess: () => {
				toast.success('Success', {
					description: `Instance successfully removed.`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
				setTimeout(() => {
					// Redirect to the cluster(instances) page or perform any other action
				}, 3000);
			},
			onError: () => {
				toast.error('Error', {
					description: `Failed to remove instance.`,
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
			<dl className="flex-none grid grid-cols-1 sm:grid-cols-3">
				<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
					<dt className="font-bold text-sm/6">Instance URL</dt>
					<dd className="text-sm/6 sm:mt-2">
						{loadingInstanceInfo ? <TextLoadingSkeleton /> : instanceInfo?.instanceFqdn}
					</dd>
				</div>
				<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
					<dt className="font-bold text-sm/6">Application URL</dt>
					<dd className="text-sm/6 sm:mt-2">
						{loadingInstanceInfo ? <TextLoadingSkeleton /> : clusterInfo?.fqdn}
					</dd>
				</div>
				<div className="px-4 pb-4 text-right sm:col-span-1 sm:px-0">
					<Button
						variant="destructiveOutline"
						className="rounded-full cursor-pointer"
						onClick={() => setIsRemoveInstanceModalOpen(true)}
					>
						Remove Instance
					</Button>
					<Button
						variant="positiveOutline"
						className="ml-4 rounded-full cursor-pointer"
						onClick={restartingInstance}
						disabled={isRestartInstancePending}
					>
						Restart Instance
					</Button>
				</div>
				<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
					<dt className="font-bold text-sm/6">Instance Node Name (for clustering)</dt>
					<dd className="text-sm/6 sm:mt-2">{loadingInstanceInfo ? <TextLoadingSkeleton /> : instanceInfo?.name}</dd>
				</div>
				{/*<div className="px-4 pb-4 sm:col-span-1 sm:px-0">*/}
				{/*	<dt className="font-bold text-sm/6">Created</dt>*/}
				{/*	<dd className="text-sm/6 sm:mt-2">*/}
				{/*		<TextLoadingSkeleton />*/}
				{/*	</dd>*/}
				{/*</div>*/}
				{/*<div className="px-4 pb-4 sm:col-span-1 sm:px-0">*/}
				{/*	<dt className="font-bold text-sm/6">Total Price</dt>*/}
				{/*	<dd className="text-sm/6 sm:mt-2">*/}
				{/*		<TextLoadingSkeleton className="w-10" />*/}
				{/*	</dd>*/}
				{/*</div>*/}
				<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
					<dt className="font-bold text-sm/6">Harper Version</dt>
					<dd className="text-sm/6 sm:mt-2">
						{loadingRegistration ? <TextLoadingSkeleton className="w-10" /> : registrationInfo.version}
					</dd>
				</div>
				<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
					<dt className="font-bold text-sm/6">RAM</dt>
					<dd className="text-sm/6 sm:mt-2">
						{loadingRegistration ? <TextLoadingSkeleton className="w-10" /> : ramAllocation}
					</dd>
				</div>
			</dl>
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
			<RemoveInstanceModal
				isModalOpen={isRemoveInstanceModalOpen}
				setIsModalOpen={setIsRemoveInstanceModalOpen}
				submitInstanceRemoval={submitInstanceRemoval}
				isPending={isDeleteInstancePending}
			/>
		</div>
	);
}
