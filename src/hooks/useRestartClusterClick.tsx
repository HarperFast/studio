import { ProgressBar } from '@/components/ProgressBar';
import { getInstanceClient } from '@/config/getInstanceClient';
import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { restartInstance } from '@/features/instance/operations/mutations/restartInstance';
import { getInstanceUserInfo } from '@/features/instance/operations/queries/getInstanceUserInfo';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { pluralize } from '@/lib/pluralize';
import { sleep } from '@/lib/sleep';
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
			description: <ProgressBar
				animated={true}
				width="0%"
			/>,
		});

		const cluster = await getClusterInfo(clusterId);
		const allInstances = cluster?.instances ?? [];
		const instanceClients = allInstances
			.filter(instance => instance.status === 'RUNNING')
			.map(instance => getInstanceClient({
				id: instance.id,
				operationsUrl: getOperationsUrlForInstance(instance),
			}))
			.reverse();
		let instancesRestarted = 0;

		if (instanceClients.length) {
			for (let i = 0; i < instanceClients.length; i++) {
				const instanceClient = instanceClients[i];
				if (!canceled) {
					toast.loading(`Restarting Instance ${i + 1} of ${instanceClients.length}`, {
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
						// Then restart it.
						await restartInstance({
							operation: 'restart',
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

		setIsRestartPending(false);

		if (canceled) {
			toast.error('Cancelled', {
				id: toastId,
				description: `The restart was partially cancelled.`,
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
				description: `Cluster fully restarted!`,
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
				description: `Failed to fully restart cluster.\n`
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
	}, [clusterId, onRestartedSuccessfully]);


	return {
		onRestartClick,
		isRestartPending,
	};
}
