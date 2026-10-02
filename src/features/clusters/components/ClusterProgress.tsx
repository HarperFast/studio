import {
	isBeingUpdated,
	isFailed,
	isMintingCloneToken,
	isPendingUpdate,
	isRunning,
	isTerminated,
} from '@/components/ui/utils/badgeStatus';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { Cluster } from '@/integrations/api/api.patch';
import { mapBy } from '@/lib/arrays/mapBy';
import { capitalizeWords } from '@/lib/string/capitalizeWords';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

/**
 * Displays a triple segment progress bar to the user which will let them watch their instance(s) progress through:
 * 	1. Pending (Clone Pending or Clone Ready)
 * 	2. Updating (Provisioning or Cloning)
 * 	3. Running (Running or Updated)
 */
export function ClusterProgress({ cluster, forceProgressBarVisible }: {
	cluster: Pick<Cluster, 'status' | 'id'>;
	forceProgressBarVisible?: boolean;
}) {
	const [showProgress, setShowProgress] = useState(forceProgressBarVisible || false);

	const { data: clusterById } = useQuery(
		getClusterInfoQueryOptions(showProgress && cluster.id, 2_000),
	);

	useEffect(function showProgressIfPendingOrUpdating() {
		if (isPendingUpdate(cluster.status) || isBeingUpdated(cluster.status)) {
			// If the cluster is ever pending or updating, we want the progress bar to stick open for that card until they
			// navigate away or refresh. So we can setShowProgress to true safely.
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setShowProgress(true);
		}
	}, [showProgress, cluster.status, clusterById?.instances]);

	const updating = useMemo(() => {
		const activePlanIds = mapBy(clusterById?.plans ?? [], 'planId');
		const instances = clusterById?.instances ?? [];
		let pending = 0;
		let updating = 0;
		let running = 0;
		let failed = 0;
		const pendingCounts: Record<string, number> = {};
		const updatingCounts: Record<string, number> = {};
		const runningCounts: Record<string, number> = {};
		const failedCounts: Record<string, number> = {};
		const tally = (counts: Record<string, number>, label: string) => {
			counts[label] = (counts[label] ?? 0) + 1;
		};
		for (const instance of instances) {
			const status = instance.status;
			if (!status || isTerminated(status)) {
				continue;
			}
			if (isPendingUpdate(status)) {
				pending += 1;
				tally(pendingCounts, status);
			} else if (isBeingUpdated(status)) {
				updating += 1;
				tally(updatingCounts, status);
			} else if (isFailed(status)) {
				failed += 1;
				tally(failedCounts, status);
			} else if (!instance.planId || !activePlanIds.includes(instance.planId)) {
				updating += 1;
				tally(updatingCounts, 'Draining Traffic');
			} else if (isRunning(status) || isMintingCloneToken(status)) {
				// The leader keeps serving while it mints a new member's clone token, so it still counts as running.
				running += 1;
				tally(runningCounts, isRunning(status) ? status : 'RUNNING');
			}
			// We'll ignore terminated or non-updated instances from the totals.
		}
		const describe = (counts: Record<string, number>) =>
			Object.keys(counts).sort().map((label) => `${counts[label]} ${capitalizeWords(label)}`);
		const total = pending + updating + running;
		return {
			pendingWidth: `${total === 0 ? 100 : pending === 0 ? 0 : (pending / total * 100)}%`,
			updatingWidth: `${updating === 0 ? 0 : (updating / total * 100)}%`,
			failedWidth: `${failed === 0 ? 0 : (failed / total * 100)}%`,
			runningWidth: `${running === 0 ? 0 : (running / total * 100)}%`,
			text: [
				...describe(runningCounts),
				...describe(failedCounts),
				...describe(updatingCounts),
				...describe(pendingCounts),
			].join(' · '),
		};
	}, [clusterById]);

	if (!showProgress) {
		return null;
	}
	return (
		<div className="w-full text-center">
			<div className="w-full h-2.5 rounded-full overflow-clip flex shadow">
				{/*Running*/}
				<div
					style={{ width: updating.runningWidth }}
					className="grow bg-green/80 transition-[width] duration-1000 ease-in-out motion-reduce:transition-none"
				>
				</div>
				{/*Failed*/}
				<div
					style={{ width: updating.failedWidth }}
					className="grow bg-red/80 transition-[width] duration-1000 ease-in-out motion-reduce:transition-none"
				>
				</div>
				{/*Updating*/}
				<div
					style={{ width: updating.updatingWidth }}
					className="grow animate-pulse bg-yellow/80 transition-[width] duration-1000 ease-in-out motion-reduce:transition-none"
				>
				</div>
				{/*Pending*/}
				<div
					style={{ width: updating.pendingWidth }}
					className="grow bg-gray-600 transition-[width] duration-1000 ease-in-out motion-reduce:transition-none"
				>
				</div>
			</div>
			{updating.text && <div className="text-xs text-muted-foreground font-light mt-2">{updating.text}</div>}
		</div>
	);
}
