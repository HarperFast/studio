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
import { onInstanceLogoutSubmit } from '@/features/auth/hooks/useInstanceLogoutMutation';
import { ClusterCardAction } from '@/features/organization/components/ClusterCardAction';
import { useAuth } from '@/hooks/useAuth';
import { Cluster } from '@/lib/api.patch';
import { authStore } from '@/lib/authStore';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { useNavigate } from '@tanstack/react-router';
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
	const auth = useAuth(cluster);
	const navigate = useNavigate();

	const isSelfManaged = useMemo(() => !cluster.plans?.length || !!cluster.plans.find((p) => p.plan === 'self-managed'), [cluster]);
	const isReadyForInteraction = useMemo(() => cluster.status && activeClusterStatuses.includes(cluster.status), [cluster]);
	const canDelete = useMemo(() => cluster.status && !deletedClusterStatuses.includes(cluster.status), [cluster]);

	const onInstancesClick = useCallback(() => navigate({ to: cluster.id }), [navigate, cluster]);
	const onSignOutClick = useCallback(async () => {
		const operationsUrl = getOperationsUrlForCluster(cluster)!;
		await onInstanceLogoutSubmit({ operationsUrl });
		authStore.setUserForEntity(cluster, null);
	}, [cluster]);
	const onDeleteClick = useCallback(() => {
		onDeleteClusterModal(cluster);
	}, [cluster, onDeleteClusterModal]);

	return (
		<Card className="relative">
			<CardHeader>
				<CardDescription className="flex items-center justify-between">
					<span className="truncate">CLUSTER ID: {cluster.id}</span>
					{(isReadyForInteraction || canDelete) && (<DropdownMenu>
						<DropdownMenuTrigger>
							<Ellipsis aria-label="Options" />
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							<DropdownMenuLabel className="text-gray-600 text-xs">Options</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{isReadyForInteraction && (
								<DropdownMenuItem onClick={onInstancesClick}>Instances</DropdownMenuItem>)}
							{isReadyForInteraction && !isSelfManaged && !auth.isLoading && auth.user && (
								<DropdownMenuItem onClick={onSignOutClick}>Sign Out</DropdownMenuItem>)}
							{/*{isReadyForInteraction && (<DropdownMenuItem>Edit</DropdownMenuItem>)}*/}
							{canDelete && (
								<DropdownMenuItem
									className="bg-red focus:bg-red/70 focus:text-white"
									onClick={onDeleteClick}>
									Delete
								</DropdownMenuItem>)}
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
				{isReadyForInteraction && (<ClusterCardAction cluster={cluster} />)}
			</CardContent>
		</Card>
	);
}
