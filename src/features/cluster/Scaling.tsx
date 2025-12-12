import { NestedContentWithSubNavMenu } from '@/components/NestedContentWithSubNavMenu';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { activeClusterStatuses } from '@/config/clusterStatuses';
import { ClusterCardAction } from '@/features/clusters/components/ClusterCardAction';
import { ClusterProgress } from '@/features/clusters/components/ClusterProgress';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useMemo } from 'react';
import { getClusterInfoQueryOptions } from './queries/getClusterInfoQuery';

export function Scaling() {
	const { clusterId }: { organizationId: string; clusterId: string } = useParams({ strict: false });
	const { data: cluster, isLoading: clusterIsLoading } = useQuery(
		getClusterInfoQueryOptions(clusterId, 2_000),
	);
	const status = cluster?.status;
	const clusterIsActive = useMemo(() => {
		return status && activeClusterStatuses.includes(status);
	}, [status]);

	if (clusterIsLoading || !cluster) {
		return (
			<NestedContentWithSubNavMenu className="flex justify-center">
				<TextLoadingSkeleton />
			</NestedContentWithSubNavMenu>
		);
	}

	if (clusterIsActive) {
		return (
			<NestedContentWithSubNavMenu className="flex justify-center">
				<div className="center w-2xl flex flex-col gap-4">
					<h1 className="text-xl text-center">All done!</h1>
					<ClusterProgress cluster={cluster} forceProgressBarVisible={true} />
					<p>Your cluster finished updating, and is ready for interaction.</p>
					<div className="text-center">
						<ClusterCardAction cluster={cluster} />
					</div>
				</div>
			</NestedContentWithSubNavMenu>
		);
	}

	return (
		<NestedContentWithSubNavMenu className="flex justify-center">
			<div className="center w-2xl flex flex-col gap-4">
				<h1 className="text-xl text-center">Here we go!</h1>
				<ClusterProgress cluster={cluster} forceProgressBarVisible={true} />
				<p>
					Your cluster is updating with the latest changes. This includes waiting several minutes to let traffic drain
					safely.{' '}
					<span className="text-muted-foreground">
						We will let you know when we are ready for you to connect! In the meantime, join us on{' '}
						<a href="https://discord.gg/VzZuaw3Xay" target="_blank" rel="noreferrer">Discord</a>! Get real-time help
						from our engineers, see feature drops early, and connect with others building on Fabric.
					</span>
				</p>
			</div>
		</NestedContentWithSubNavMenu>
	);
}
