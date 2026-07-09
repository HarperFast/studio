import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { EntityContextMenu, type EntityMenuItem, renderEntityMenuItems } from '@/components/ui/entityMenu';
import { isBeingUpdated, isFailed, isPendingUpdate, renderBadgeStatusVariant } from '@/components/ui/utils/badgeStatus';
import { activeClusterStatuses, deletedClusterStatuses } from '@/config/clusterStatuses';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClient } from '@/config/useInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { ClusterCardAction } from '@/features/clusters/components/ClusterCardAction';
import { ClusterContainerOpModals } from '@/features/clusters/components/ClusterContainerOpModals';
import { ClusterProgress } from '@/features/clusters/components/ClusterProgress';
import { SafeModeConfirmDialog } from '@/features/clusters/components/SafeModeConfirmDialog';
import { useTerminateClusterMutation } from '@/features/clusters/mutations/terminateCluster';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useClusterContainerOps } from '@/hooks/useClusterContainerOps';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/integrations/api/api.patch';
import { ContainerStrategy } from '@/integrations/api/cluster/containerOperation';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { onInstanceLogoutSubmit } from '@/integrations/api/instance/auth/onInstanceLogoutSubmit';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { capitalizeWords } from '@/lib/string/capitalizeWords';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';
import {
	ClipboardIcon,
	CopyIcon,
	Ellipsis,
	GitGraphIcon,
	GlobeIcon,
	KeyIcon,
	LifeBuoyIcon,
	Loader2,
	PlayIcon,
	RocketIcon,
	RotateCwIcon,
	ScaleIcon,
	ServerIcon,
	SquareIcon,
	TrashIcon,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

export function ClusterCard({ cluster }: { cluster: Cluster }) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const operationsUrl = useMemo(() => getOperationsUrlForCluster(cluster), [cluster]);
	const instanceClient = useInstanceClient({ operationsUrl });
	const auth = useInstanceAuth(cluster.id);
	const [, setSavedClusterState] = useLocalStorage<unknown | null>(LocalStorageKeys.SavedClusterState, null);

	const { view, update, remove, create } = useOrganizationClusterPermissions(cluster.organizationId, cluster.id);
	const { mutate: terminateCluster, isPending: isTerminateClusterPending } = useTerminateClusterMutation();

	const [signingOut, setSigningOut] = useState(false);
	const [isTerminateClusterModalOpen, setIsTerminateClusterModalOpen] = useState(false);
	const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
	const [restartDialogOpen, setRestartDialogOpen] = useState(false);
	const [safeModeAction, setSafeModeAction] = useState<'start' | 'restart' | null>(null);
	const { run: runClusterOp, isPending: isClusterOpPending } = useClusterContainerOps(cluster);

	// Container-op availability by cluster state (see the per-instance menu for the same idea):
	//   RUNNING → Restart, Restart in safe mode, Stop     STOPPED → Start, Start in safe mode
	//   PARTIAL → Start, Stop, Restart (some up, some down)
	const isClusterRunning = cluster.status === 'RUNNING';
	const isClusterStopped = cluster.status === 'STOPPED';
	const isClusterPartial = cluster.status === 'PARTIAL';

	// Temporary status badge on the card for container-op states. Transitional states tell the user
	// what's happening (Stopping/Starting/Restarting) and clear on their own as the clusters list
	// polls; STOPPED/PARTIAL are resting labels. RUNNING stays clean (no badge) on this route.
	const isClusterTransitioning = cluster.status === 'STOPPING' || cluster.status === 'STARTING'
		|| cluster.status === 'RESTARTING';
	const showContainerOpBadge = isClusterTransitioning || isClusterStopped || isClusterPartial;

	const isActive = useMemo(
		() => !!(cluster.status && activeClusterStatuses.includes(cluster.status)),
		[cluster.status],
	);
	const isSelfManaged = clusterIsSelfManaged(cluster);
	const isFabricConnect = authStore.checkForFabricConnect(cluster.id);
	const isDirectConnect = !isFabricConnect && !!auth.user;
	const isTerminated = useMemo(
		() => !!(cluster.status && deletedClusterStatuses.includes(cluster.status)),
		[cluster.status],
	);
	const clusterHasFailed = useMemo(
		() => !!(cluster.status && isFailed(cluster.status)),
		[cluster.status],
	);
	// Version can be edited from any settled state (including FAILED) — just not
	// while the cluster is actively provisioning, cloning, draining or upgrading.
	const canEditVersion = update && !isSelfManaged && !isTerminated
		&& !isBeingUpdated(cluster.status) && !isPendingUpdate(cluster.status);

	const onSignOutClick = useCallback(async () => {
		setSigningOut(true);
		const fullCluster = await getClusterInfo(cluster.id).catch((err) => {
			console.error('Failed to lookup cluster details, proceeding without checking instances.', err);
			return null;
		});
		await onInstanceLogoutSubmit({ entityId: cluster.id, instanceClient });
		if (fullCluster?.instances?.length) {
			// Flag all cluster instances as signed out as well.
			for (const instance of fullCluster.instances) {
				authStore.setUserForEntity(instance, null);
			}
		}
		authStore.setUserForEntity(cluster, null);
	}, [cluster, instanceClient]);

	const onTryAgainClick = useCallback(() => {
		setSavedClusterState(cluster);
		void router.navigate({ to: `/${cluster.organizationId}/new-cluster` });
	}, [cluster, router, setSavedClusterState]);

	const onTerminateClick = useCallback(() => setIsTerminateClusterModalOpen(true), []);

	const handleTerminatedCluster = useCallback(() => {
		const organizationId = cluster.organizationId;
		terminateCluster(cluster.id, {
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: [organizationId],
					refetchType: 'active',
				});
				await router.invalidate();
				toast.success('Success', {
					description: isSelfManaged
						? `Cluster successfully removed.`
						: `Cluster successfully terminated.`,
					duration: 5000,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
				setIsTerminateClusterModalOpen(false);
			},
			onError: () => {
				toast.error('Error', {
					description: isSelfManaged
						? `Failed to remove cluster: ${cluster.name}`
						: `Failed to terminate cluster: ${cluster.name}.`,
					duration: 5000,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
				setIsTerminateClusterModalOpen(false);
			},
		});
	}, [router, cluster.organizationId, cluster.id, cluster.name, terminateCluster, isSelfManaged, queryClient]);

	// The whole card opens the cluster home (overview) for the normal "Open" case — including
	// self-hosted clusters, which get their own overview. A managed cluster with no FQDN yet opens its
	// instances; resetPassword (→ Finish Setup / Pending) keeps its explicit CTA in ClusterCardAction.
	// Stopped/partial clusters aren't "active" but must still be reachable: a fully-stopped cluster
	// opens its instances page (where you start them back up); a partial cluster (some instances still
	// running) opens the cluster overview like a normal cluster.
	const cardHref = !view || isTerminated
		? undefined
		: cluster.status === 'STOPPED'
		? `/${cluster.organizationId}/${cluster.id}/instances`
		: cluster.status === 'PARTIAL'
		? `/${cluster.organizationId}/${cluster.id}`
		: !isActive
		? undefined
		: isSelfManaged
		? `/${cluster.organizationId}/${cluster.id}`
		: !cluster.fqdn
		? `/${cluster.organizationId}/${cluster.id}/instances`
		: !cluster.resetPassword
		? `/${cluster.organizationId}/${cluster.id}`
		: undefined;

	const clusterFQDN = cluster.domains?.[0]?.domain || cluster.fqdn;
	const [onCopyFQDNClick, onCopyAPIClick] = useCopyToClipboard(
		`${clusterFQDN}`,
		`https://${clusterFQDN}`,
	);

	const menuItems: EntityMenuItem[] = [
		{ type: 'label' as const, key: 'label', className: 'text-gray-600 text-xs', label: 'Options' },
		{ type: 'separator' as const, key: 'label-separator' },
		isActive && update && !auth.isLoading && (!isDirectConnect || isFabricConnect) && {
			key: 'sign-in',
			to: `${cluster.id}/sign-in`,
			disabled: signingOut,
			icon: <KeyIcon className="text-green" />,
			label: 'Direct Sign In',
		},
		isActive && view && !!operationsUrl && !auth.isLoading && isDirectConnect && {
			key: 'direct-sign-out',
			onClick: onSignOutClick,
			disabled: signingOut,
			label: 'Direct Sign Out',
		},
		isActive && update && {
			key: 'edit',
			to: `${cluster.id}/edit`,
			disabled: signingOut,
			icon: <ScaleIcon className="text-purple-600" />,
			label: isSelfManaged ? 'Edit' : 'Edit Scaling',
		},
		canEditVersion && {
			key: 'edit-version',
			to: `${cluster.id}/edit/version`,
			disabled: signingOut,
			icon: <GitGraphIcon className="text-fuchsia-300" />,
			label: 'Edit Version',
		},
		isActive && update && !isLocalStudio && !clusterIsSelfManaged(cluster) && {
			key: 'domains',
			to: `${cluster.id}/domains`,
			disabled: signingOut,
			icon: <GlobeIcon className="text-cyan-400" />,
			label: 'Domains',
		},
		isActive && view && {
			key: 'instances',
			to: `${cluster.id}/instances`,
			disabled: signingOut,
			icon: <ServerIcon className="text-orange-300" />,
			label: 'Instances',
		},
		isActive && view && {
			key: 'deployments',
			to: `${cluster.id}/config/deployments`,
			disabled: signingOut,
			icon: <RocketIcon className="text-sky-400" />,
			label: 'Deployments',
		},

		update && (isClusterRunning || isClusterStopped || isClusterPartial)
		&& { type: 'separator' as const, key: 'container-separator' },
		update && (isClusterRunning || isClusterStopped || isClusterPartial)
		&& { type: 'label' as const, key: 'container-label', className: 'text-gray-600 text-xs', label: 'Container' },
		update && (isClusterStopped || isClusterPartial) && {
			key: 'container-start',
			disabled: isClusterOpPending,
			onClick: () => void runClusterOp('start', { safeMode: false, strategy: 'parallel' }),
			icon: <PlayIcon />,
			label: 'Start',
		},
		update && isClusterStopped && {
			key: 'container-start-safe',
			disabled: isClusterOpPending,
			onClick: () => setSafeModeAction('start'),
			icon: <LifeBuoyIcon />,
			label: 'Start in safe mode',
		},
		update && (isClusterRunning || isClusterPartial) && {
			key: 'container-restart',
			disabled: isClusterOpPending,
			onClick: () => setRestartDialogOpen(true),
			icon: <RotateCwIcon />,
			label: 'Restart',
		},
		update && isClusterRunning && {
			key: 'container-restart-safe',
			disabled: isClusterOpPending,
			onClick: () => setSafeModeAction('restart'),
			icon: <LifeBuoyIcon />,
			label: 'Restart in safe mode',
		},
		update && (isClusterRunning || isClusterPartial) && {
			key: 'container-stop',
			variant: 'destructive' as const,
			disabled: isClusterOpPending,
			onClick: () => setStopConfirmOpen(true),
			icon: <SquareIcon />,
			label: 'Stop',
		},

		isActive && view && !!cluster.fqdn && { type: 'separator' as const, key: 'copy-separator' },
		isActive && view && !!cluster.fqdn && {
			key: 'copy-host-name',
			onClick: onCopyFQDNClick,
			disabled: signingOut,
			icon: <ClipboardIcon />,
			label: 'Copy Host Name',
		},
		isActive && view && !!cluster.fqdn && {
			key: 'copy-api-url',
			onClick: onCopyAPIClick,
			disabled: signingOut,
			icon: <ClipboardIcon />,
			label: 'Copy API URL',
		},

		clusterHasFailed && create && {
			key: 'try-again',
			onClick: onTryAgainClick,
			className: 'focus:bg-green/70 focus:text-white',
			label: 'Try Again',
		},
		!isTerminated && remove && isActive && { type: 'separator' as const, key: 'remove-separator' },
		!isTerminated && remove && {
			key: 'remove',
			onClick: onTerminateClick,
			className: 'focus:bg-red/70 focus:text-white',
			icon: <TrashIcon className="text-red-300" />,
			label: isSelfManaged ? 'Remove' : 'Terminate',
		},
	].filter(excludeFalsy);

	return (
		<EntityContextMenu items={isTerminated ? [] : menuItems}>
			<Card
				className={`relative h-full justify-between transition-[transform,box-shadow] duration-200 ${
					cardHref
						? 'hover:scale-[1.02] hover:shadow-lg hover:ring-2 hover:ring-primary/60 dark:hover:ring-violet-400/70'
						: 'hover:shadow-lg'
				}`}
			>
				{cardHref && (
					<Link
						to={cardHref}
						aria-label={`${isSelfManaged || cluster.fqdn ? 'Open' : 'View'} ${cluster.name}`}
						className="absolute inset-0 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-purple-200 focus-visible:outline-none"
					/>
				)}
				<CardHeader>
					<CardDescription className="flex items-center justify-between">
						{clusterFQDN
							? (
								<>
									<span className="truncate max-w-48">{clusterFQDN}</span>
									<button
										type="button"
										aria-label="Copy host name"
										onClick={(e) => {
											e.stopPropagation();
											onCopyFQDNClick();
										}}
										className="relative z-10 -m-1.5 p-1.5 rounded-md text-muted-foreground cursor-pointer hover:bg-accent/60 hover:text-foreground"
									>
										<CopyIcon size={16} />
									</button>
									<span className="grow"></span>
								</>
							)
							: <span>Self-Hosted</span>}
						{!isTerminated && (
							<DropdownMenu>
								<DropdownMenuTrigger
									aria-label="Cluster options"
									onClick={(e) => e.stopPropagation()}
									className="relative z-10 -m-2 p-2 rounded-md hover:bg-accent/60"
								>
									<Ellipsis />
								</DropdownMenuTrigger>
								<DropdownMenuContent>
									{renderEntityMenuItems(menuItems, 'dropdown')}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</CardDescription>
					<CardTitle>
						<h2>{cluster.name}</h2>
					</CardTitle>
				</CardHeader>
				<CardContent className="flex items-center justify-between gap-2">
					<ClusterProgress cluster={cluster} />
					{isActive && view && <ClusterCardAction cluster={cluster} hasCardLink={!!cardHref} />}
					{showContainerOpBadge && cluster.status && (
						<Badge variant={isClusterStopped ? 'destructive' : 'warning'}>
							{isClusterTransitioning && <Loader2 className="animate-spin" />}
							{capitalizeWords(cluster.status)}
						</Badge>
					)}
					{clusterHasFailed && cluster.status && (
						<>
							<Badge variant={renderBadgeStatusVariant(cluster.status)}>{capitalizeWords(cluster.status)}</Badge>
							<span className="text-xs">Click "..." to choose how to proceed.</span>
						</>
					)}
				</CardContent>

				<ConfirmDeletionModal
					typeOfThingBeingDeleted="cluster"
					transitiveVerb={isSelfManaged ? 'Remove' : 'Terminate'}
					presentParticiple={isSelfManaged ? 'Removing' : 'Terminating'}
					nameOfThingBeingDeleted={cluster.name}
					isModalOpen={isTerminateClusterModalOpen}
					hideDataLossWarning={isSelfManaged}
					setIsModalOpen={(isOpen: boolean) => setIsTerminateClusterModalOpen(isOpen)}
					deletionConfirmed={handleTerminatedCluster}
					deletionPending={isTerminateClusterPending}
				/>

				<ClusterContainerOpModals
					clusterName={cluster.name}
					isPending={isClusterOpPending}
					stopOpen={stopConfirmOpen}
					setStopOpen={setStopConfirmOpen}
					onConfirmStop={() => {
						setStopConfirmOpen(false);
						void runClusterOp('stop', { strategy: 'parallel' });
					}}
					restartOpen={restartDialogOpen}
					setRestartOpen={setRestartDialogOpen}
					onConfirmRestart={(strategy: ContainerStrategy) => {
						setRestartDialogOpen(false);
						void runClusterOp('restart', { safeMode: false, strategy });
					}}
				/>

				<SafeModeConfirmDialog
					open={safeModeAction !== null}
					setOpen={(isOpen) => {
						if (!isOpen) { setSafeModeAction(null); }
					}}
					action={safeModeAction ?? 'restart'}
					clusterName={cluster.name}
					isPending={isClusterOpPending}
					onConfirm={() => {
						const action = safeModeAction;
						setSafeModeAction(null);
						if (action) {
							void runClusterOp(action, {
								safeMode: true,
								strategy: 'parallel',
								label: action === 'start' ? 'Starting in safe mode' : 'Restarting in safe mode',
							});
						}
					}}
				/>
			</Card>
		</EntityContextMenu>
	);
}
