import { SubNavMenu } from '@/components/SubNavMenu';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { activeClusterStatuses } from '@/config/clusterStatuses';
import { ClusterCardAction } from '@/features/clusters/components/ClusterCardAction';
import { ClusterProgress } from '@/features/clusters/components/ClusterProgress';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useMemo } from 'react';
import { getClusterInfoQueryOptions } from './queries/getClusterInfoQuery';

export function StartingUp() {
	const { clusterId }: { organizationId: string; clusterId: string; } = useParams({ strict: false });
	const { data: cluster, isLoading: clusterIsLoading } = useQuery(
		getClusterInfoQueryOptions(clusterId, 2000),
	);
	const status = cluster?.status;
	const isActive = useMemo(() => {
		return status && activeClusterStatuses.includes(status);
	}, [status]);

	return (
		<>
			<SubNavMenu />
			<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))] flex justify-center">
				{clusterIsLoading || !cluster
					? <TextLoadingSkeleton />
					: (<div className="center max-w-2xl flex flex-col gap-4">
						<h1 className="text-xl text-center">Here we go!</h1>
						<ClusterProgress cluster={cluster} forceProgressBarVisible={true} />
						{!isActive ? (<>
							<p>Your cluster is spinning up with the latest changes, including your own DNS records and private
								connections. Please wait while we get everything going. <span className="text-muted-foreground">We will
									let you know when we are ready for you to connect! In the meantime, may I suggest a cup of water, tea
									or perhaps a hot bean juice? ☕</span></p>
						</>) : (<>
							<p>
								It's ready! Let's set up your secure, browser-to-cluster connection
								now. <span className="text-muted-foreground">Did you know you connect straight to your cluster,
								providing a private secure connection?</span>
							</p>
							<div className="text-center">
								<ClusterCardAction cluster={cluster} />
							</div>
						</>)}
					</div>)
				}
			</div>
		</>
	);
}
