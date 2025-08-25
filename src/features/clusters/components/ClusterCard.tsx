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
import { renderBadgeStatusText, renderBadgeStatusVariant } from '@/components/ui/utils/badgeStatus';
import { useInstanceClient } from '@/config/useInstanceClient';
import { ClusterCardAction } from '@/features/clusters/components/ClusterCardAction';
import { onInstanceLogoutSubmit } from '@/features/instance/operations/mutations/onInstanceLogoutSubmit';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/lib/api.patch';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { authStore } from '@/lib/authStore';
import { notYetImplemented } from '@/lib/notYetImplemented';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { Link } from '@tanstack/react-router';
import { Ellipsis } from 'lucide-react';
import { useCallback, useMemo } from 'react';

const activeClusterStatuses = ['RUNNING'];
const deletedClusterStatuses = ['TERMINATING', 'TERMINATED', 'REMOVED'];

export function ClusterCard({
	cluster,
	onDeleteClusterModal,
}: {
	cluster: Cluster;
	onDeleteClusterModal: (cluster: Cluster) => void;
}) {
	const { view, update, remove } = useOrganizationClusterPermissions(cluster.organizationId, cluster.id);
	const auth = useInstanceAuth(cluster.id);

	const isActive = useMemo(() => cluster.status && activeClusterStatuses.includes(cluster.status), [cluster.status]);
	const notTerminated = useMemo(() => cluster.status && !deletedClusterStatuses.includes(cluster.status), [cluster.status]);
	const operationsUrl = useMemo(() => getOperationsUrlForCluster(cluster), [cluster]);
	const instanceClient = useInstanceClient(operationsUrl);

	const onSignOutClick = useCallback(async () => {
		await onInstanceLogoutSubmit({ instanceClient });
		authStore.setUserForEntity(cluster, null);
		if (cluster.instances?.length) {
			// Flag all cluster instances as signed out as well.
			for (const instance of cluster.instances) {
				authStore.setUserForEntity(instance, null);
			}
		}
	}, [cluster, instanceClient]);
	const onDeleteClick = useCallback(() => {
		onDeleteClusterModal(cluster);
	}, [cluster, onDeleteClusterModal]);

	const menuItems = [
		isActive && update && (
			<DropdownMenuItem onClick={notYetImplemented}>Edit</DropdownMenuItem>),
		isActive && view && (
			<Link to={cluster.id}><DropdownMenuItem>Instances</DropdownMenuItem></Link>),
		isActive && view && !!operationsUrl && !auth.isLoading && auth.user && (
			<DropdownMenuItem onClick={onSignOutClick}>Sign Out</DropdownMenuItem>),
		notTerminated && remove && (
			<DropdownMenuItem
				className="bg-red focus:bg-red/70 focus:text-white"
				onClick={onDeleteClick}>
				Delete
			</DropdownMenuItem>
		),
	].filter(excludeFalsy);

	return (
		<Card className="relative">
			<CardHeader>
				<CardDescription className="flex items-center justify-between">
					<span className="truncate">{cluster.id}</span>
					<DropdownMenu>
						<DropdownMenuTrigger>
							<Ellipsis aria-label="Cluster options" />
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							<DropdownMenuLabel className="text-gray-600 text-xs">Plans</DropdownMenuLabel>
							{cluster.plans?.map(plan => (
								<DropdownMenuLabel key={plan.planId}>
									{plan.planId} / {plan.regionId}<br />
									Auto Renewal {plan.autoRenew
									? <Badge variant="success">ON</Badge>
									: <Badge variant="warning">OFF</Badge>}
								</DropdownMenuLabel>
							))}
							{menuItems.length > 0 && (<>
								<DropdownMenuSeparator />
								{...menuItems}
							</>)}
						</DropdownMenuContent>
					</DropdownMenu>
				</CardDescription>
				<CardTitle>
					<h2>{cluster.name}</h2>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex justify-between">
				{cluster.status && (
					<Badge variant={renderBadgeStatusVariant(cluster.status)}>{renderBadgeStatusText(cluster.status)}</Badge>)}
				{isActive && view && (<ClusterCardAction cluster={cluster} />)}
			</CardContent>
		</Card>
	);
}
