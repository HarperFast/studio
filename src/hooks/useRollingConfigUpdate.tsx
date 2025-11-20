import { ProgressBar } from '@/components/ProgressBar';
import { getInstanceClient } from '@/config/getInstanceClient';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { Instance } from '@/integrations/api/api.patch';
import { getInstanceUserInfo } from '@/integrations/api/instance/status/getInstanceUserInfo';
import { restartInstance } from '@/integrations/api/instance/status/restartInstance';
import { setConfiguration } from '@/integrations/api/instance/status/setConfiguration';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { pluralize } from '@/lib/pluralize';
import { sleep } from '@/lib/sleep';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

interface RollingConfigUpdateParams {
	onRestartedSuccessfully?: () => void;
}

interface RollingConfigUpdateResponse {
	onConfigUpdate: (params: Record<string, unknown>) => void;
	isPending: boolean;
}

export function useRollingConfigUpdate({ onRestartedSuccessfully }: RollingConfigUpdateParams = {}): RollingConfigUpdateResponse {
	const operationsParams = useInstanceClientIdParams();
	const queryClient = useQueryClient();
	const [isPending, setIsPending] = useState(false);
	const onConfigUpdate = useCallback(async (params: Record<string, unknown>) => {
		setIsPending(true);

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
			description: <ProgressBar
				animated={true}
				width="0%"
			/>,
		});

		const cluster = operationsParams.entityType === 'cluster'
			? await getClusterInfo(operationsParams.entityId)
			: null;
		const allInstances = operationsParams.entityType === 'cluster'
			? cluster?.instances || []
			: [{ id: operationsParams.entityId, status: 'RUNNING' } as Instance];
		const clusterUsesFabricConnect = !!cluster && authStore.checkForFabricConnect(cluster.id);
		const instanceClients = operationsParams.entityType === 'cluster'
			? allInstances
				.filter(instance => instance.status === 'RUNNING')
				.map(instance => getInstanceClient({
					id: instance.id,
					forceFabricConnect: clusterUsesFabricConnect,
					operationsUrl: getOperationsUrlForInstance(instance),
				}))
				.reverse()
			: [operationsParams.instanceClient];
		let instancesRestarted = 0;

		if (instanceClients.length) {
			for (let i = 0; i < instanceClients.length; i++) {
				const instanceClient = instanceClients[i];
				if (!canceled) {
					toast.loading(`Updating Instance ${i + 1} of ${instanceClients.length}`, {
						...toastConfig,
						id: toastId,
						description: <ProgressBar
							animated={true}
							width={(i === 0 ? 0 : (i / instanceClients.length * 100)) + '%'}
						/>,
					});
					try {
						// Make sure the instance is responding.
						await getInstanceUserInfo({
							instanceClient,
						});

						await setConfiguration({
							...params,
							instanceClient,
						});
						// Then restart it.
						await restartInstance({
							operation: 'restart_service',
							replicated: false,
							instanceClient,
						});
						instancesRestarted += 1;
					} catch {
						if (i + 1 !== instanceClients.length) {
							// If it fails to restart, or wasn't available, warn for a bit then move on.
							toast.loading(`Failed Restarting Instance ${i + 1} of ${instanceClients.length}`, {
								...toastConfig,
								id: toastId,
								description: 'We will carry on momentarily.',
							});
							await sleep(3000);
						}
					}
				}
			}
		}

		setIsPending(false);
		void queryClient.invalidateQueries({ queryKey: [operationsParams.entityId, 'get_configuration'] });

		if (canceled) {
			toast.error('Cancelled', {
				id: toastId,
				description: `The config update was partially cancelled.`,
				duration: 10_000,
				action: {
					label: 'Dismiss',
					onClick: () => toast.dismiss(),
				},
			});
		} else if (allInstances.length === instancesRestarted) {
			onRestartedSuccessfully?.();
			toast.success('Success', {
				id: toastId,
				description: `Your configuration has been updated successfully!`,
				duration: 10_000,
				action: {
					label: 'Dismiss',
					onClick: () => toast.dismiss(),
				},
			});
		} else {
			const allTheInstances = pluralize(allInstances.length, 'instance', 'instances');
			const someRunningInstancesWere = pluralize(
				instancesRestarted,
				'"RUNNING" instance was',
				'"RUNNING" instances were',
			);
			toast.error('Error', {
				id: toastId,
				description: `Failed to fully update cluster.\n`
					+ ([
						allInstances.length === 0 && 'No instances were found within the cluster to restart.',
						instancesRestarted === 0 && `No instances were in a "RUNNING" state of ${allTheInstances}.`,
						allInstances.length !== instancesRestarted && `Only ${someRunningInstancesWere} restarted of ${allTheInstances}.`,
					].filter(excludeFalsy).shift() || ''),
				duration: 10_000,
				action: {
					label: 'Dismiss',
					onClick: () => toast.dismiss(),
				},
			});
		}
	}, [operationsParams, onRestartedSuccessfully, queryClient]);

	return {
		onConfigUpdate,
		isPending,
	};
}
