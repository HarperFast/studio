import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { EntityContextMenu, type EntityMenuItem, renderEntityMenuItems } from '@/components/ui/entityMenu';
import { isBeingUpdated, isFailed, isPendingUpdate } from '@/components/ui/utils/badgeStatus';
import { activeClusterStatuses, deletedClusterStatuses } from '@/config/clusterStatuses';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClient } from '@/config/useInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { ClusterCardAction } from '@/features/clusters/components/ClusterCardAction';
import { ClusterContainerOpModals } from '@/features/clusters/components/ClusterContainerOpModals';
import { ClusterProgress } from '@/features/clusters/components/ClusterProgress';
import { SafeModeConfirmDialog } from '@/features/clusters/components/SafeModeConfirmDialog';
import type { ClusterListItem } from '@/features/clusters/lib/clusterListModel';
import { useTerminateClusterMutation } from '@/features/clusters/mutations/terminateCluster';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useClusterContainerOps } from '@/hooks/useClusterContainerOps';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { ContainerStrategy } from '@/integrations/api/cluster/containerOperation';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { onInstanceLogoutSubmit } from '@/integrations/api/instance/auth/onInstanceLogoutSubmit';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
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

export function ClusterCard({ item: summary }: { item: ClusterListItem }) {
	const { cluster } = summary;
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

	const isActive = useMemo(
		() => !!(cluster.status && activeClusterStatuses.includes(cluster.status)),
		[cluster.status],
	);
	const isSelfManaged = clusterIsSelfManaged(cluster);
	// Self-hosted clusters have no managed container lifecycle — Harper doesn't control their
	// runtime — so the whole Container action group is hidden for them (matching ClusterStateMenu).
	const showContainerActions = update && !isSelfManaged;
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
		isActive && view && !!auth.user && {
			key: 'deployments',
			to: `${cluster.id}/config/deployments`,
			disabled: signingOut,
			icon: <RocketIcon className="text-sky-400" />,
			label: 'Deployments',
		},

		showContainerActions && (isClusterRunning || isClusterStopped || isClusterPartial)
		&& { type: 'separator' as const, key: 'container-separator' },
		showContainerActions && (isClusterRunning || isClusterStopped || isClusterPartial)
		&& { type: 'label' as const, key: 'container-label', className: 'text-gray-600 text-xs', label: 'Container' },
		showContainerActions && (isClusterStopped || isClusterPartial) && {
			key: 'container-start',
			disabled: isClusterOpPending,
			onClick: () => void runClusterOp('start', { safeMode: false, strategy: 'parallel' }),
			icon: <PlayIcon />,
			label: 'Start',
		},
		showContainerActions && isClusterStopped && {
			key: 'container-start-safe',
			disabled: isClusterOpPending,
			onClick: () => setSafeModeAction('start'),
			icon: <LifeBuoyIcon />,
			label: 'Start in safe mode',
		},
		showContainerActions && (isClusterRunning || isClusterPartial) && {
			key: 'container-restart',
			disabled: isClusterOpPending,
			onClick: () => setRestartDialogOpen(true),
			icon: <RotateCwIcon />,
			label: 'Restart',
		},
		showContainerActions && isClusterRunning && {
			key: 'container-restart-safe',
			disabled: isClusterOpPending,
			onClick: () => setSafeModeAction('restart'),
			icon: <LifeBuoyIcon />,
			label: 'Restart in safe mode',
		},
		showContainerActions && (isClusterRunning || isClusterPartial) && {
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
				className={`group/cluster relative isolate min-w-0 h-full overflow-hidden border border-border bg-card/30 py-0 gap-0 shadow-sm transition-[background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none ${
					cardHref
						? 'cursor-pointer hover:border-primary hover:bg-card/70 hover:shadow-xl hover:shadow-primary/20 hover:ring-2 hover:ring-primary/70 dark:hover:border-violet-400 dark:hover:ring-violet-400/70'
						: ''
				}`}
			>
				{cardHref && (
					<Link
						to={cardHref}
						aria-label={`${isSelfManaged || cluster.fqdn ? 'Open' : 'View'} ${cluster.name}`}
						className="absolute inset-0 z-1 cursor-pointer rounded-[inherit] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
					/>
				)}
				<CardHeader className="gap-3 bg-linear-to-br from-primary/15 via-primary/5 to-transparent px-5 py-5">
					<div className="flex items-center gap-2">
						<Badge
							variant={summary.category === 'failed'
								? 'destructive'
								: summary.category === 'attention'
								? 'warning'
								: summary.category === 'running'
								? 'success'
								: 'secondary'}
							className="rounded-full"
						>
							<span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
							{summary.label}
						</Badge>
						<span className="text-xs text-muted-foreground">{summary.hosting}</span>
					</div>
					<CardTitle>
						<h2 className="break-words text-xl font-semibold leading-snug">{cluster.name}</h2>
					</CardTitle>
					<CardDescription className="flex min-w-0 items-center gap-3 justify-between">
						{clusterFQDN
							? (
								<>
									<span className="min-w-0 truncate" title={clusterFQDN}>{clusterFQDN}</span>
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
							: <span>{isSelfManaged ? 'Self-hosted endpoint' : 'Hostname not assigned'}</span>}
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
				</CardHeader>
				<CardContent className="border-t border-border px-5 py-4">
					<dl className="grid grid-cols-3 gap-3 text-sm">
						<div>
							<dt className="text-xs text-muted-foreground">Instances</dt>
							<dd className="mt-1 font-medium tabular-nums">
								{summary.instanceCount ?? (
									<span title="Not reported">
										<span aria-hidden="true">—</span>
										<span className="sr-only">Not reported</span>
									</span>
								)}
							</dd>
						</div>
						<div className="min-w-0">
							<dt className="text-xs text-muted-foreground">Regions</dt>
							<dd className="mt-1 break-words font-medium">{summary.regions.join(', ') || 'Not reported'}</dd>
						</div>
						<div className="min-w-0">
							<dt className="text-xs text-muted-foreground">Harper version</dt>
							<dd className="mt-1 break-words font-medium">
								{summary.version || (
									<span title="Not reported">
										<span aria-hidden="true">—</span>
										<span className="sr-only">Not reported</span>
									</span>
								)}
							</dd>
						</div>
					</dl>
				</CardContent>
				<CardContent className="mt-auto flex flex-col gap-3 border-t border-border px-5 py-4">
					<ClusterProgress cluster={cluster} />
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="min-w-0 flex-1 text-xs">
							{summary.notices.length
								? (
									<ul
										className={`space-y-1 ${
											summary.category === 'failed' ? 'text-destructive' : 'text-amber-800 dark:text-yellow'
										}`}
									>
										{summary.notices.map(notice => <li key={notice}>{notice}</li>)}
									</ul>
								)
								: (
									<span className="text-muted-foreground">
										{isSelfManaged
											? 'Monitoring managed externally'
											: summary.category === 'running'
											? 'Cluster is running'
											: summary.label}
									</span>
								)}
							{clusterHasFailed && create && (
								<p className="mt-1 text-muted-foreground">Open cluster options to retry or manage this cluster.</p>
							)}
						</div>
						{isActive && view && <ClusterCardAction cluster={cluster} hasCardLink={!!cardHref} />}
					</div>
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
					targetName={cluster.name}
					scope="cluster"
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
