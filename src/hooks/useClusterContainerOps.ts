import { Cluster } from '@/integrations/api/api.patch';
import { ContainerStrategy, useClusterContainerOperation } from '@/integrations/api/cluster/containerOperation';
import { ContainerAction } from '@/integrations/api/instance/containerOperation';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

const GERUND: Record<ContainerAction, string> = {
	stop: 'Stopping',
	start: 'Starting',
	restart: 'Restarting',
};

export interface RunClusterOpOptions {
	safeMode?: boolean;
	strategy?: ContainerStrategy;
	/** Override the display label, e.g. "Restarting in safe mode". */
	label?: string;
}

/**
 * Fires a cluster-wide container op with the standard loading → success/error toast + cache
 * invalidation (mirrors {@link useInstanceContainerOps}). The op is async, so "accepted" means the
 * fan-out started; the clusters list / overview poll reflect the resting state shortly after.
 */
export function useClusterContainerOps(cluster: Cluster) {
	const { mutateAsync, isPending } = useClusterContainerOperation();
	const queryClient = useQueryClient();

	const run = useCallback(
		async (action: ContainerAction, opts?: RunClusterOpOptions) => {
			const gerund = opts?.label ?? GERUND[action];
			const toastId = toast.loading(gerund, {
				description: `${gerund} cluster ${cluster.name}. Status will update automatically.`,
				duration: 30_000,
				action: { label: 'Dismiss', onClick: () => toast.dismiss() },
			});
			try {
				await mutateAsync({ clusterId: cluster.id, action, safeMode: opts?.safeMode, strategy: opts?.strategy });
				void queryClient.invalidateQueries({ queryKey: [cluster.organizationId] });
				void queryClient.invalidateQueries({ queryKey: [cluster.id] });
				toast.dismiss(toastId);
				toast.success('Request accepted', {
					description: `${cluster.name} is ${gerund.toLowerCase()}. The status will update automatically.`,
					action: { label: 'Dismiss', onClick: () => toast.dismiss() },
				});
			} catch {
				toast.dismiss(toastId);
				toast.error('Error', {
					description: `Failed to ${action} cluster ${cluster.name}.`,
					action: { label: 'Dismiss', onClick: () => toast.dismiss() },
				});
			}
		},
		[cluster.id, cluster.name, cluster.organizationId, mutateAsync, queryClient],
	);

	return { run, isPending };
}
