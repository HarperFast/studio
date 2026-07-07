import { Instance } from '@/integrations/api/api.patch';
import { ContainerAction, useInstanceContainerOperation } from '@/integrations/api/instance/containerOperation';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useCallback } from 'react';
import { toast } from 'sonner';

const GERUND: Record<ContainerAction, string> = {
	stop: 'Stopping',
	start: 'Starting',
	restart: 'Restarting',
};

export interface RunContainerOpOptions {
	/** start/restart only; omit for stop. Explicit false exits safe mode. */
	safeMode?: boolean;
	/** Override the display label, e.g. "Restarting in safe mode". */
	label?: string;
}

/**
 * Fires an instance container op with the standard loading → success/error toast and cache
 * invalidation, mirroring {@link useRestartInstanceClick}. The op is async backend-side, so
 * "accepted" means the instance entered its transitional state; the instances-page poll reflects
 * the resting state shortly after.
 */
export function useInstanceContainerOps(instance: Instance) {
	const { clusterId }: { clusterId?: string } = useParams({ strict: false });
	const { mutateAsync, isPending } = useInstanceContainerOperation();
	const queryClient = useQueryClient();

	const run = useCallback(
		async (action: ContainerAction, opts?: RunContainerOpOptions) => {
			const gerund = opts?.label ?? GERUND[action];
			const target = instance.name ?? instance.id;
			const toastId = toast.loading(gerund, {
				description: `${gerund} ${target}. Status will update shortly.`,
				duration: 30_000,
				action: { label: 'Dismiss', onClick: () => toast.dismiss() },
			});
			try {
				await mutateAsync({ instanceId: instance.id, action, safeMode: opts?.safeMode });
				void queryClient.invalidateQueries({ queryKey: [clusterId] });
				void queryClient.invalidateQueries({ queryKey: [instance.id] });
				toast.dismiss(toastId);
				toast.success('Request accepted', {
					description: `${target} is ${gerund.toLowerCase()}. The status will update automatically.`,
					action: { label: 'Dismiss', onClick: () => toast.dismiss() },
				});
			} catch {
				toast.dismiss(toastId);
				toast.error('Error', {
					description: `Failed to ${action} ${target}.`,
					action: { label: 'Dismiss', onClick: () => toast.dismiss() },
				});
			}
		},
		[clusterId, instance.id, instance.name, mutateAsync, queryClient],
	);

	return { run, isPending };
}
