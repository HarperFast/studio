import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Ellipsis } from 'lucide-react';
import { Link, useNavigate } from '@tanstack/react-router';
import { renderBadgeStatusText, renderBadgeStatusVariant } from '@/components/ui/utils/badgeStatus';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { Cluster } from '@/lib/api.patch';
import { useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { onInstanceLogoutSubmit } from '@/features/auth/hooks/useInstanceLogoutMutation';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { authStore } from '@/lib/authStore';

export function ClusterCard({
	cluster,
	onDeleteClusterModal,
}: {
	cluster: Cluster;
	onDeleteClusterModal: () => void;
}) {
	const auth = useAuth(cluster);
	const navigate = useNavigate();

	const isSelfManaged = useMemo(() => !cluster.plans?.length || !!cluster.plans.find((p) => p.plan === 'self-managed'), [cluster]);
	const isReadyForInteraction = useMemo(() => ['CLONE_READY', 'RUNNING', 'UPDATED'].includes(cluster.status), [cluster]);
	const canDelete = useMemo(() => !['TERMINATING', 'TERMINATED', 'REMOVED'].includes(cluster.status), [cluster]);

	const onInstancesClick = useCallback(() => navigate({ to: cluster.id }), [navigate, cluster]);
	const onSignOutClick = useCallback(async () => {
		const operationsUrl = getOperationsUrlForCluster(cluster)!;
		await onInstanceLogoutSubmit({ operationsUrl });
		authStore.setUserForEntity(cluster, null);
	}, [cluster]);

	return (
		<Card className="relative">
			<CardHeader>
				<CardDescription className="flex items-center justify-between">
					<span className="truncate">CLUSTER ID: {cluster.id}</span>
					<DropdownMenu>
						<DropdownMenuTrigger>
							<Ellipsis aria-label="Cluster options" />
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							<DropdownMenuLabel className="text-gray-600 text-xs">Cluster options</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{isReadyForInteraction && <DropdownMenuItem onClick={onInstancesClick}>Instances</DropdownMenuItem>}
							{isReadyForInteraction && !isSelfManaged && !auth.isLoading && auth.user && <DropdownMenuItem onClick={onSignOutClick}>Sign Out</DropdownMenuItem>}
							<DropdownMenuItem>Edit</DropdownMenuItem>
							{canDelete &&
								<DropdownMenuItem
									className="bg-red focus:bg-red/70 focus:text-white"
									onClick={onDeleteClusterModal}>
									Delete
								</DropdownMenuItem>
							}
						</DropdownMenuContent>
					</DropdownMenu>
				</CardDescription>
				<CardTitle>
					<h2>{cluster.name}</h2>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex justify-between">
				<Badge
					variant={renderBadgeStatusVariant(cluster.status)}>{renderBadgeStatusText(cluster.status)}</Badge>
				{isReadyForInteraction && <>
					{isSelfManaged ? (
						<Link to={cluster.id} className="text-sm" aria-label={`View ${cluster.name}`} title={`View ${cluster.name}`}>
							<span className="py-2 hover:border-b-2">
								Instances <ArrowRight className="inline-block" />
							</span>
						</Link>
					) : <>
						{!auth.isLoading && !auth.user && (
							<Link to={`${cluster.id}/sign-in`} className="text-sm" aria-label={`Sign In to ${cluster.name}`} title={`Sign In to ${cluster.name}`}>
								<span className="py-2 hover:border-b-2">
									Sign In <ArrowRight className="inline-block" />
								</span>
							</Link>
						)}
						{!auth.isLoading && auth.user && (
							<Link to={`${cluster.id}/browse`} preload={false} className="text-sm" aria-label={`View ${cluster.name}`} title={`View ${cluster.name}`}>
								<span className="py-2 hover:border-b-2">
									View <ArrowRight className="inline-block" />
								</span>
							</Link>
						)}
					</>}
				</>}
			</CardContent>
		</Card>
	);
}
