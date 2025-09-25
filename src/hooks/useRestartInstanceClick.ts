import { isLocalStudio } from '@/config/constants';
import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useRestartInstance } from '@/features/instance/operations/mutations/restartInstance';
import { queryKeys } from '@/react-query/constants';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useCallback } from 'react';
import { toast } from 'sonner';

interface RestartInstanceClickParams extends InstanceClientConfig {
	operation: 'restart_service' | 'restart';
	onRestartedSuccessfully?: () => void;
}

interface RestartInstanceClickResponse {
	onRestartClick: () => void;
	isRestartPending: boolean;
}

export function useRestartInstanceClick({
	operation,
	instanceClient,
	onRestartedSuccessfully,
}: RestartInstanceClickParams): RestartInstanceClickResponse {
	const { clusterId, instanceId }: { clusterId?: string; instanceId?: string; } = useParams({ strict: false });
	const targetNoun = (instanceId || isLocalStudio) ? 'Instance' : 'Cluster';
	const { mutate: restartInstance, isPending: isRestartPending } = useRestartInstance();
	const queryClient = useQueryClient();
	const onRestartClick = useCallback(() => {
		const toastId = toast.loading('Restarting', {
			description: `Restarting ${targetNoun.toLowerCase()}. This may take up to 60 seconds.`,
			duration: 180_000,
			action: {
				label: 'Dismiss',
				onClick: () => toast.dismiss(),
			},
		});
		restartInstance({
			operation,
			replicated: operation === 'restart_service' && targetNoun === 'Cluster',
			instanceClient,
		}, {
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: [queryKeys.cluster, clusterId, queryKeys.instance, instanceId], refetchType: 'active' });
				void queryClient.invalidateQueries({ queryKey: [clusterId], refetchType: 'active' });
				void queryClient.invalidateQueries({ queryKey: [instanceId], refetchType: 'active' });
				toast.dismiss(toastId);
				toast.success('Success', {
					description: `${targetNoun} restarted!`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
				onRestartedSuccessfully?.();
			},
			onError: () => {
				toast.dismiss(toastId);
				toast.error('Error', {
					description: `Failed to restart ${targetNoun.toLowerCase()}.`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			},
		});
	}, [clusterId, instanceClient, instanceId, onRestartedSuccessfully, operation, queryClient, restartInstance, targetNoun]);

	return {
		onRestartClick,
		isRestartPending,
	};
}
