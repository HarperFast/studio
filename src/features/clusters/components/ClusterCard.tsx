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
import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { ClusterCardAction } from '@/features/clusters/components/ClusterCardAction';
import { onInstanceLogoutSubmit } from '@/features/instance/operations/mutations/onInstanceLogoutSubmit';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/lib/api.patch';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { authStore } from '@/lib/authStore';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { Link } from '@tanstack/react-router';
import { Ellipsis } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

const activeClusterStatuses = ['RUNNING'];
const deletedClusterStatuses = ['TERMINATING', 'TERMINATED', 'REMOVED'];

export function ClusterCard({
	cluster,
	onTerminateClusterModal,
}: {
	cluster: Cluster;
	onTerminateClusterModal: (cluster: Cluster) => void;
}) {
	const { view, update, remove } = useOrganizationClusterPermissions(cluster.organizationId, cluster.id);
	const auth = useInstanceAuth(cluster.id);

	const isActive = useMemo(() => cluster.status && activeClusterStatuses.includes(cluster.status), [cluster.status]);
	const isTerminated = useMemo(() => cluster.status && deletedClusterStatuses.includes(cluster.status), [cluster.status]);
	const operationsUrl = useMemo(() => getOperationsUrlForCluster(cluster), [cluster]);
	const instanceClient = useInstanceClient(operationsUrl);
	const [signingOut, setSigningOut] = useState(false);

	const onSignOutClick = useCallback(async () => {
		setSigningOut(true);
		const fullCluster = await getClusterInfo(cluster.id).catch(err => {
			console.error('Failed to lookup cluster details, proceeding without checking instances.', err);
			return null;
		});
		await onInstanceLogoutSubmit({ instanceClient });
		if (fullCluster?.instances?.length) {
			// Flag all cluster instances as signed out as well.
			for (const instance of fullCluster.instances) {
				authStore.setUserForEntity(instance, null);
			}
		}
		authStore.setUserForEntity(cluster, null);
	}, [cluster, instanceClient]);
	const onTerminateClick = useCallback(() => {
		onTerminateClusterModal(cluster);
	}, [cluster, onTerminateClusterModal]);

	const menuItems = [
		isActive && update && (
			<Link to={`${cluster.id}/edit`} disabled={signingOut}><DropdownMenuItem>Edit</DropdownMenuItem></Link>),
		isActive && view && (
			<Link to={`${cluster.id}/instances`} disabled={signingOut}><DropdownMenuItem>Instances</DropdownMenuItem></Link>),
		isActive && view && !!operationsUrl && !auth.isLoading && auth.user && (
			<DropdownMenuItem onClick={onSignOutClick} disabled={signingOut}>Sign Out</DropdownMenuItem>),
		!isTerminated && remove && (
			<DropdownMenuItem
				className="bg-red focus:bg-red/70 focus:text-white"
				onClick={onTerminateClick}>
				Terminate
			</DropdownMenuItem>
		),
	].filter(excludeFalsy);

	return (
		<Card className="relative h-full justify-between">
			<CardHeader>
				<CardDescription className="flex items-center justify-between">
					<span className="truncate">{cluster.id}</span>
					{!isTerminated && (<DropdownMenu>
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
					</DropdownMenu>)}
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
