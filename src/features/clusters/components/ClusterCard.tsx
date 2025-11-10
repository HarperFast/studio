import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { activeClusterStatuses, deletedClusterStatuses } from '@/config/clusterStatuses';
import { useInstanceClient } from '@/config/useInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { ClusterCardAction } from '@/features/clusters/components/ClusterCardAction';
import { ClusterProgress } from '@/features/clusters/components/ClusterProgress';
import { useTerminateClusterMutation } from '@/features/clusters/mutations/terminateCluster';
import { onInstanceLogoutSubmit } from '@/features/instance/operations/mutations/onInstanceLogoutSubmit';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/lib/api.patch';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';
import { CopyIcon, Ellipsis } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

export function ClusterCard({ cluster }: { cluster: Cluster; }) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const operationsUrl = useMemo(() => getOperationsUrlForCluster(cluster), [cluster]);
	const instanceClient = useInstanceClient(operationsUrl);
	const auth = useInstanceAuth(cluster.id);

	const { view, update, remove } = useOrganizationClusterPermissions(cluster.organizationId, cluster.id);
	const { mutate: terminateCluster, isPending: isTerminateClusterPending } = useTerminateClusterMutation();

	const [signingOut, setSigningOut] = useState(false);
	const [isTerminateClusterModalOpen, setIsTerminateClusterModalOpen] = useState(false);

	const isActive = useMemo(() => cluster.status && activeClusterStatuses.includes(cluster.status), [cluster.status]);
	const isSelfManaged = useMemo(() => !!cluster?.plans?.[0]?.planId?.startsWith('self-hosted'), [cluster]);
	const isTerminated = useMemo(
		() => cluster.status && deletedClusterStatuses.includes(cluster.status),
		[cluster.status],
	);

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

	const [onCopyFQDNClick, onCopyAPIClick] = useCopyToClipboard(
		`${cluster.fqdn}`,
		`https://${cluster.fqdn}`,
	);

	const menuItems = [
		isActive && update && (
			<Link to={`${cluster.id}/edit`} disabled={signingOut}>
				<DropdownMenuItem>Edit</DropdownMenuItem>
			</Link>
		),
		isActive && view && (
			<Link to={`${cluster.id}/instances`} disabled={signingOut}>
				<DropdownMenuItem>Instances</DropdownMenuItem>
			</Link>
		),
		isActive && view && cluster.fqdn && (
			<DropdownMenuItem onClick={onCopyFQDNClick} disabled={signingOut}>
				Copy host name
			</DropdownMenuItem>
		),
		isActive && view && cluster.fqdn && (
			<DropdownMenuItem onClick={onCopyAPIClick} disabled={signingOut}>
				Copy API URL
			</DropdownMenuItem>
		),
		isActive && view && !!operationsUrl && !auth.isLoading && auth.user && (
			<DropdownMenuItem onClick={onSignOutClick} disabled={signingOut}>
				Sign Out
			</DropdownMenuItem>
		),
		!isTerminated && remove && (
			<DropdownMenuItem className="focus:bg-red/70 focus:text-white" onClick={onTerminateClick}>
				{isSelfManaged ? 'Remove' : 'Terminate'}
			</DropdownMenuItem>
		),
	].filter(excludeFalsy);

	return (
		<Card className="relative h-full justify-between">
			<CardHeader>
				<CardDescription className="flex items-center justify-between">
					{cluster.fqdn ? (
						<>
							<span className="truncate max-w-48">{cluster.fqdn}</span>
							<CopyIcon onClick={onCopyFQDNClick} size={16} className="cursor-pointer" />
							<span className="grow"></span>
						</>
					) : (
						<span>Self-Hosted</span>
					)}
					{!isTerminated && (
						<DropdownMenu>
							<DropdownMenuTrigger>
								<Ellipsis aria-label="Cluster options" />
							</DropdownMenuTrigger>
							<DropdownMenuContent>
								<DropdownMenuLabel className="text-gray-600 text-xs">Plans</DropdownMenuLabel>
								{cluster.plans?.map((plan) => (
									<DropdownMenuLabel key={plan.planId + plan.regionId}>
										{plan.planId} / {plan.regionId}
										<br />
										Auto Renewal <Badge variant="success">ON</Badge>
									</DropdownMenuLabel>
								))}
								{menuItems.length > 0 && (
									<>
										<DropdownMenuSeparator />
										{...menuItems}
									</>
								)}
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
				{isActive && view && <ClusterCardAction cluster={cluster} />}
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
		</Card>
	);
}
