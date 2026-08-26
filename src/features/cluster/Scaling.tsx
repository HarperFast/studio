import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { ClusterContentWithSubNavMenu } from '@/features/cluster/components/ClusterContentWithSubNavMenu';
import { ClusterCardAction } from '@/features/clusters/components/ClusterCardAction';
import { ClusterProgress } from '@/features/clusters/components/ClusterProgress';
import { isConversionComplete } from '@/features/clusters/lib/grantExpiry';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearch } from '@tanstack/react-router';
import { useMemo } from 'react';
import { getClusterInfoQueryOptions } from './queries/getClusterInfoQuery';

export function Scaling() {
	const { clusterId }: { organizationId: string; clusterId: string } = useParams({ strict: false });
	// The router JSON-parses search values, but a hand-edited URL can leave `immediate`
	// as an arbitrary (truthy) string — only accept an explicit true.
	const { immediate }: { immediate?: boolean | string } = useSearch({ strict: false });
	const isImmediate = immediate === true || immediate === 'true';
	const { data: cluster, isLoading: clusterIsLoading } = useQuery(
		getClusterInfoQueryOptions(clusterId, 2_000),
	);
	// Not RUNNING alone: a trial->paid conversion reaches RUNNING before the server applies the plan,
	// so status by itself declares the update finished while the plan change is still in flight.
	const clusterIsActive = useMemo(() => cluster && isConversionComplete(cluster), [cluster]);

	if (clusterIsLoading || !cluster) {
		return (
			<ClusterContentWithSubNavMenu className="flex justify-center">
				<TextLoadingSkeleton />
			</ClusterContentWithSubNavMenu>
		);
	}

	if (clusterIsActive) {
		return (
			<ClusterContentWithSubNavMenu className="flex justify-center">
				<div className="center w-2xl flex flex-col gap-4">
					<h1 className="text-xl text-center">All done!</h1>
					<ClusterProgress cluster={cluster} forceProgressBarVisible={true} />
					<p>Your cluster finished updating, and is ready for interaction.</p>
					<div className="text-center">
						<ClusterCardAction cluster={cluster} />
					</div>
				</div>
			</ClusterContentWithSubNavMenu>
		);
	}

	return (
		<ClusterContentWithSubNavMenu className="flex justify-center">
			<div className="center w-2xl flex flex-col gap-4">
				<h1 className="text-xl text-center">Here we go!</h1>
				<ClusterProgress cluster={cluster} forceProgressBarVisible={true} />
				<p>
					{isImmediate
						? 'Your cluster is applying the latest changes immediately, without waiting to take instances out of rotation.'
						: 'Your cluster is updating with the latest changes. This includes waiting several minutes to let traffic drain safely.'}
					{' '}
					<span className="text-muted-foreground">
						We will let you know when we are ready for you to connect! In the meantime, join us on{' '}
						<a
							href="https://discord.gg/VzZuaw3Xay"
							target="_blank"
							rel="noreferrer"
							className="underline hover:text-blue-300"
						>
							Discord
						</a>! Get real-time help from our engineers, see feature drops early, and connect with others building on
						Fabric.
					</span>
				</p>
			</div>
		</ClusterContentWithSubNavMenu>
	);
}
