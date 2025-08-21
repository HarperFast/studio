import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useRestartInstance } from '@/features/instance/operations/mutations/restartInstance';
import { useCallback } from 'react';
import { toast } from 'sonner';

interface RestartClickParams extends InstanceClientConfig {
	targetNoun: 'Instance' | 'Cluster';
	operation: 'restart_service' | 'restart';
	onRestartedSuccessfully?: () => void;
}

interface RestartClickResponse {
	onRestartClick: () => void;
	isRestartPending: boolean;
}

export function useRestartClick({
	targetNoun,
	operation,
	instanceClient,
	onRestartedSuccessfully,
}: RestartClickParams): RestartClickResponse {
	const { mutate: restartInstance, isPending: isRestartPending } = useRestartInstance();
	const onRestartClick = useCallback(() => {
		const toastId = toast.loading('Restarting', {
			description: `Restarting ${targetNoun.toLowerCase()}. This may take up to 60 seconds.`,
			duration: 60_000,
			action: {
				label: 'Dismiss',
				onClick: () => toast.dismiss(),
			},
		});
		restartInstance({ operation, instanceClient }, {
			onSuccess: () => {
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
				toast.error('Error', {
					description: `Failed to restart ${targetNoun.toLowerCase()}.`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			},
		});
	}, [instanceClient, onRestartedSuccessfully, operation, restartInstance, targetNoun]);

	return {
		onRestartClick,
		isRestartPending,
	};
}
