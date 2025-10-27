import { isBeingUpdated, isPendingUpdate, isRunning } from '@/components/ui/utils/badgeStatus';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { Cluster } from '@/lib/api.patch';
import { countBy } from '@/lib/countBy';
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
	cluster: Pick<Cluster, 'status' | 'id'>,
	forceProgressBarVisible?: boolean
}) {
	const [showProgress, setShowProgress] = useState(forceProgressBarVisible || false);

	const { data: clusterById } = useQuery(
		getClusterInfoQueryOptions(showProgress && cluster.id, 2000),
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
		const instances = clusterById?.instances ?? [];
		const counts = countBy(instances, 'status');
		let pending = 0;
		const pendingTexts: string[] = [];
		let updating = 0;
		const updatingTexts: string[] = [];
		let running = 0;
		const runningTexts: string[] = [];
		for (const status in counts) {
			if (isPendingUpdate(status)) {
				pending += counts[status];
				pendingTexts.push(counts[status] + ' ' + capitalizeWords(status));
			} else if (isBeingUpdated(status)) {
				updating += counts[status];
				updatingTexts.push(counts[status] + ' ' + capitalizeWords(status));
			} else if (isRunning(status)) {
				running += counts[status];
				runningTexts.push(counts[status] + ' ' + capitalizeWords(status));
			}
			// We'll ignore terminated or non-updated instances from the totals.
		}
		const total = pending + updating + running;
		return {
			pendingWidth: `${total === 0 ? 100 : pending === 0 ? 0 : (pending / total * 100)}%`,
			updatingWidth: `${updating === 0 ? 0 : (updating / total * 100)}%`,
			runningWidth: `${running === 0 ? 0 : (running / total * 100)}%`,
			text: [
				...runningTexts.sort(),
				...updatingTexts.sort(),
				...pendingTexts.sort(),
			].join(' · '),
		};
	}, [clusterById?.instances]);

	if (!showProgress) {
		return null;
	}
	return (<div className="w-full text-center">
		<div className="w-full h-2.5 rounded-full overflow-clip flex shadow">
			{/*Running*/}
			<div style={{ width: updating.runningWidth }} className="grow bg-green/80 transition-[width] duration-1000 ease-in-out motion-reduce:transition-none"></div>
			{/*Updating*/}
			<div style={{ width: updating.updatingWidth }} className="grow animate-pulse bg-yellow/80 transition-[width] duration-1000 ease-in-out motion-reduce:transition-none"></div>
			{/*Pending*/}
			<div style={{ width: updating.pendingWidth }} className="grow bg-gray-600 transition-[width] duration-1000 ease-in-out motion-reduce:transition-none"></div>
		</div>
		{updating.text && (<div className="text-xs text-muted-foreground font-light mt-2">{updating.text}</div>)}
	</div>);
}
