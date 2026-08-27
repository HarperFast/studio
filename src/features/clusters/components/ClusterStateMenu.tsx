import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { ClusterContainerOpModals } from '@/features/clusters/components/ClusterContainerOpModals';
import { SafeModeConfirmDialog } from '@/features/clusters/components/SafeModeConfirmDialog';
import { isStartBlockedByPlan } from '@/features/clusters/lib/grantExpiry';
import { useTerminateClusterMutation } from '@/features/clusters/mutations/terminateCluster';
import { useClusterContainerOps } from '@/hooks/useClusterContainerOps';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/integrations/api/api.patch';
import { ContainerStrategy } from '@/integrations/api/cluster/containerOperation';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { ChevronDown, LifeBuoyIcon, PlayIcon, RotateCwIcon, SquareIcon, TrashIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

/**
 * "Cluster actions" dropdown (AWS EC2 "Instance state" style) for the cluster overview: every
 * container lifecycle op plus Terminate in one discoverable, labeled place. Ops that don't apply to
 * the current status are shown but disabled, so users can see the feature set exists. Self-hosted
 * clusters have no container ops, so the control is hidden for them.
 */
export function ClusterStateMenu({ cluster }: { cluster: Cluster }) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { update, remove } = useOrganizationClusterPermissions(cluster.organizationId, cluster.id);
	const { run: runClusterOp, isPending } = useClusterContainerOps(cluster);
	const { mutate: terminateCluster, isPending: isTerminatePending } = useTerminateClusterMutation();

	const [stopOpen, setStopOpen] = useState(false);
	const [restartOpen, setRestartOpen] = useState(false);
	const [terminateOpen, setTerminateOpen] = useState(false);
	// Both safe-mode ops route through one explain-and-confirm dialog; this tracks which.
	const [safeModeAction, setSafeModeAction] = useState<'start' | 'restart' | null>(null);

	const isRunning = cluster.status === 'RUNNING';
	const isStopped = cluster.status === 'STOPPED';
	const isPartial = cluster.status === 'PARTIAL';
	const opsDisabled = !update || isPending;
	// Matches ClusterCard, and the server's own start gate — see isStartBlockedByPlan. Terminate
	// stays either way: leaving is always allowed.
	const planEndedAndDown = isStartBlockedByPlan(cluster);

	const onTerminate = useCallback(() => {
		terminateCluster(cluster.id, {
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: [cluster.organizationId], refetchType: 'active' });
				setTerminateOpen(false);
				toast.success('Success', {
					description: 'Cluster successfully terminated.',
					action: { label: 'Dismiss', onClick: () => toast.dismiss() },
				});
				// The overview for a terminated cluster is a dead end — return to the clusters list.
				void router.navigate({ to: `/${cluster.organizationId}` });
			},
			onError: () => {
				// The global MutationCache.onError already toasts the failure (with the server's
				// message); just close the modal here to avoid double-toasting.
				setTerminateOpen(false);
			},
		});
	}, [cluster.id, cluster.organizationId, terminateCluster, queryClient, router]);

	const onConfirmSafeMode = useCallback(() => {
		const action = safeModeAction;
		setSafeModeAction(null);
		if (action) {
			void runClusterOp(action, {
				safeMode: true,
				strategy: 'parallel',
				label: action === 'start' ? 'Starting in safe mode' : 'Restarting in safe mode',
			});
		}
	}, [safeModeAction, runClusterOp]);

	// Container ops are managed-cluster only; a user with neither permission gets no control.
	if (clusterIsSelfManaged(cluster) || (!update && !remove)) { return null; }

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						disabled={isPending}
						className="gap-1.5 hover:translate-y-0 data-[state=open]:[&>svg]:rotate-180"
					>
						Cluster actions
						<ChevronDown className="size-4 transition-transform" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56">
					{!planEndedAndDown && (
						<>
							<DropdownMenuLabel className="text-gray-600 text-xs">Container</DropdownMenuLabel>
							<DropdownMenuItem
								disabled={opsDisabled || !(isStopped || isPartial)}
								onClick={() => void runClusterOp('start', { safeMode: false, strategy: 'parallel' })}
							>
								<PlayIcon /> Start
							</DropdownMenuItem>
							<DropdownMenuItem disabled={opsDisabled || !isStopped} onClick={() => setSafeModeAction('start')}>
								<LifeBuoyIcon /> Start in safe mode
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={opsDisabled || !(isRunning || isPartial)}
								onClick={() => setRestartOpen(true)}
							>
								<RotateCwIcon /> Restart
							</DropdownMenuItem>
							<DropdownMenuItem disabled={opsDisabled || !isRunning} onClick={() => setSafeModeAction('restart')}>
								<LifeBuoyIcon /> Restart in safe mode
							</DropdownMenuItem>
							<DropdownMenuItem
								variant="destructive"
								disabled={opsDisabled || !(isRunning || isPartial)}
								onClick={() => setStopOpen(true)}
							>
								<SquareIcon /> Stop
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					)}
					<DropdownMenuItem variant="destructive" disabled={!remove} onClick={() => setTerminateOpen(true)}>
						<TrashIcon /> Terminate
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<ClusterContainerOpModals
				clusterName={cluster.name}
				isPending={isPending}
				stopOpen={stopOpen}
				setStopOpen={setStopOpen}
				onConfirmStop={() => {
					setStopOpen(false);
					void runClusterOp('stop', { strategy: 'parallel' });
				}}
				restartOpen={restartOpen}
				setRestartOpen={setRestartOpen}
				onConfirmRestart={(strategy: ContainerStrategy) => {
					setRestartOpen(false);
					void runClusterOp('restart', { safeMode: false, strategy });
				}}
			/>

			<SafeModeConfirmDialog
				open={safeModeAction !== null}
				setOpen={(isOpen) => {
					if (!isOpen) { setSafeModeAction(null); }
				}}
				action={safeModeAction ?? 'restart'}
				targetName={cluster.name}
				scope="cluster"
				isPending={isPending}
				onConfirm={onConfirmSafeMode}
			/>

			<ConfirmDeletionModal
				typeOfThingBeingDeleted="cluster"
				transitiveVerb="Terminate"
				presentParticiple="Terminating"
				nameOfThingBeingDeleted={cluster.name}
				isModalOpen={terminateOpen}
				setIsModalOpen={setTerminateOpen}
				deletionConfirmed={onTerminate}
				deletionPending={isTerminatePending}
			/>
		</>
	);
}
