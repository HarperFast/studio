import { isLocalStudio } from '@/config/constants';
import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useRestartInstance } from '@/integrations/api/instance/status/restartInstance';
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
	const { clusterId, instanceId }: { clusterId?: string; instanceId?: string } = useParams({ strict: false });
	const targetNoun = (instanceId || isLocalStudio) ? 'Instance' : 'Cluster';
	const { mutateAsync: restartInstance, isPending: isRestartPending } = useRestartInstance();
	const queryClient = useQueryClient();
	const onRestartClick = useCallback(async () => {
		const toastId = toast.loading('Restarting', {
			description: `Restarting ${targetNoun.toLowerCase()}. This may take up to 60 seconds.`,
			duration: 180_000,
			action: {
				label: 'Dismiss',
				onClick: () => toast.dismiss(),
			},
		});
		// Await the mutation directly rather than using the mutate() callbacks. Those callbacks are
		// dropped if the component unmounts before the restart finishes (e.g. the user navigates to
		// another tab while the instance comes back up), which would orphan the loading toast forever
		// since sonner never auto-dismisses a loading toast. The awaited continuation runs regardless.
		try {
			await restartInstance({
				operation,
				replicated: operation === 'restart_service' && targetNoun === 'Cluster',
				instanceClient,
			});
			void queryClient.invalidateQueries({ queryKey: [clusterId] });
			void queryClient.invalidateQueries({ queryKey: [instanceId] });
			toast.dismiss(toastId);
			toast.success('Success', {
				description: `${targetNoun} restarted!`,
				action: {
					label: 'Dismiss',
					onClick: () => toast.dismiss(),
				},
			});
			onRestartedSuccessfully?.();
		} catch {
			toast.dismiss(toastId);
			toast.error('Error', {
				description: `Failed to restart ${targetNoun.toLowerCase()}.`,
				action: {
					label: 'Dismiss',
					onClick: () => toast.dismiss(),
				},
			});
		}
	}, [
		clusterId,
		instanceClient,
		instanceId,
		onRestartedSuccessfully,
		operation,
		queryClient,
		restartInstance,
		targetNoun,
	]);

	return {
		onRestartClick,
		isRestartPending,
	};
}
