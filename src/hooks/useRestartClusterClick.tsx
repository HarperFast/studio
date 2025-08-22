import { getInstanceClient } from '@/config/getInstanceClient';
import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { restartInstance } from '@/features/instance/operations/mutations/restartInstance';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { useParams } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

interface RestartClusterClickParams {
	onRestartedSuccessfully?: () => void;
}

interface RestartClusterClickResponse {
	onRestartClick: () => void;
	isRestartPending: boolean;
}

export function useRestartClusterClick({ onRestartedSuccessfully }: RestartClusterClickParams = {}): RestartClusterClickResponse {
	const { clusterId }: { clusterId?: string; } = useParams({ strict: false });
	const [isRestartPending, setIsRestartPending] = useState(false);
	const onRestartClick = useCallback(async () => {
		if (!clusterId) {
			throw new Error('clusterId must be set in the route to invoke useRestartClusterClick');
		}
		setIsRestartPending(true);

		let canceled = false;
		const toastConfig = {
			duration: 60_000,
			action: {
				label: 'Cancel',
				onClick: () => {
					canceled = true;
				},
			},
		};

		const toastId = toast.loading('Restarting', {
			...toastConfig,
			description: renderProgressUpdate(),
		});

		const cluster = await getClusterInfo(clusterId);
		let succeeded = false;
		if (cluster) {
			const instanceClients = cluster.instances?.map(instance => {
				return getInstanceClient({ id: instance.id, operationsUrl: getOperationsUrlForInstance(instance) });
			});
			if (instanceClients?.length) {
				for (let i = 0; i < instanceClients.length; i++) {
					const instanceClient = instanceClients[i];
					if (!canceled) {
						toast.loading('Restarting', {
							...toastConfig,
							id: toastId,
							description: renderProgressUpdate(i, instanceClients.length),
						});
						await restartInstance({
							operation: 'restart',
							replicated: false,
							instanceClient,
						});
					}
				}
				succeeded = true;
			}
		}

		setIsRestartPending(false);

		if (canceled) {
			toast.error('Cancelled', {
				id: toastId,
				description: `The restart was partially cancelled.`,
				action: {
					label: 'Dismiss',
					onClick: () => toast.dismiss(),
				},
			});
		} else if (succeeded) {
			onRestartedSuccessfully?.();
			toast.success('Success', {
				id: toastId,
				description: `Cluster restarted!`,
				action: {
					label: 'Dismiss',
					onClick: () => toast.dismiss(),
				},
			});
		} else {
			toast.error('Error', {
				id: toastId,
				description: `Failed to restart cluster.`,
				action: {
					label: 'Dismiss',
					onClick: () => toast.dismiss(),
				},
			});
		}
	}, [clusterId, onRestartedSuccessfully]);


	return {
		onRestartClick,
		isRestartPending,
	};
}

function renderProgressUpdate(current?: number, total?: number) {
	return (<>
		Restarting cluster instances.
		{current !== undefined && total !== undefined && total > 0 && (
			<div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
				<div className="bg-purple-600 h-2.5 rounded-full dark:bg-purple-500" style={{ width: (current === 0 ? 0 : (current / total * 100)) + '%' }}></div>
			</div>)}
	</>);
}
