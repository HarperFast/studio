import { ContactUs } from '@/components/ContactUs';
import { NestedContentWithSubNavMenu } from '@/components/NestedContentWithSubNavMenu';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { isFailed } from '@/components/ui/utils/badgeStatus';
import { activeClusterStatuses } from '@/config/clusterStatuses';
import { ClusterCardAction } from '@/features/clusters/components/ClusterCardAction';
import { ClusterProgress } from '@/features/clusters/components/ClusterProgress';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from '@tanstack/react-router';
import { CloudAlertIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { getClusterInfoQueryOptions } from './queries/getClusterInfoQuery';

export function StartingUp() {
	const router = useRouter();
	const { clusterId }: { organizationId: string; clusterId: string; } = useParams({ strict: false });
	const { data: cluster, isLoading: clusterIsLoading } = useQuery(
		getClusterInfoQueryOptions(clusterId, 2000),
	);

	const status = cluster?.status;

	const clusterIsActive = useMemo(() => {
		return status && activeClusterStatuses.includes(status);
	}, [status]);
	const clusterHasFailed = isFailed(status);
	const [, setSavedClusterState] = useLocalStorage<unknown | null>(LocalStorageKeys.SavedClusterState, null);

	const onTryAgainClick = useCallback(() => {
		setSavedClusterState(cluster);
		void router.navigate({ to: `/${cluster!.organizationId}/new-cluster` });
	}, [cluster, router, setSavedClusterState]);

	if (clusterIsLoading || !cluster) {
		return (
			<NestedContentWithSubNavMenu className="flex justify-center">
				<TextLoadingSkeleton />
			</NestedContentWithSubNavMenu>
		);
	}

	if (clusterHasFailed) {
		return (
			<NestedContentWithSubNavMenu className="flex justify-center">
				<div className="center max-w-2xl flex flex-col gap-4 items-center">
					<CloudAlertIcon className="w-24 h-24" />
					<span>
						Your cluster failed to successfully start. This is usually caused by temporary communication
						problems. Would you like to try again? We also get notified about these failures. <ContactUs /> if
						you want more help.
					</span>
					<Button
						type="button"
						variant="positiveOutline"
						onClick={onTryAgainClick}
					>
						Try Again
					</Button>
				</div>
			</NestedContentWithSubNavMenu>
		);
	}

	if (clusterIsActive) {
		return (
			<NestedContentWithSubNavMenu className="flex justify-center">
				<div className="center max-w-2xl flex flex-col gap-4">
					<h1 className="text-xl text-center">It's ready!</h1>
					<ClusterProgress cluster={cluster} forceProgressBarVisible={true} />
					<p>
						Let's set up your secure, browser-to-cluster connection
						now. <span className="text-muted-foreground">Did you know you connect straight to your cluster,
						providing a private secure connection?</span>
					</p>
					<div className="text-center">
						<ClusterCardAction cluster={cluster} />
					</div>
				</div>
			</NestedContentWithSubNavMenu>
		);
	}

	return (
		<NestedContentWithSubNavMenu className="flex justify-center">
			<div className="center max-w-2xl flex flex-col gap-4">
				<h1 className="text-xl text-center">Here we go!</h1>
				<ClusterProgress cluster={cluster} forceProgressBarVisible={true} />
				<p>Your cluster is spinning up with the latest changes, including your own DNS records and private
					connections. Please wait while we get everything going. <span className="text-muted-foreground">We will
						let you know when we are ready for you to connect! In the meantime, may I suggest a cup of water, tea
						or perhaps a hot bean juice? ☕</span></p>
			</div>
		</NestedContentWithSubNavMenu>
	);
}
