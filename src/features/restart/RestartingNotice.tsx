import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { connectsThroughProxy } from '@/config/getInstanceClient';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { useRestartState } from '@/hooks/useRestartState';
import { holdsRequests } from '@/lib/restart/restartTracker';
import { useQuery } from '@tanstack/react-query';
import { LoaderCircleIcon } from 'lucide-react';

/** How often to re-read the cluster from central manager while it is restarting. */
const RESTART_POLL_MS = 5_000;

/**
 * Tells the user a cluster or instance is restarting, and why the page has gone quiet: its requests
 * are held until the target is back (`installRestartGate`), so nothing here errors in the meantime.
 *
 * While shown it also polls the cluster record. That is what ends a container-op restart — the
 * tracker follows central manager's statuses only as cluster records are fetched — and most pages
 * that render this notice don't otherwise poll the cluster at all.
 */
export function RestartingNotice(
	{ entityId, clusterId, noun, className }: {
		entityId?: string;
		clusterId?: string;
		noun: 'cluster' | 'instance';
		className?: string;
	},
) {
	const state = useRestartState(entityId);
	useQuery({ ...getClusterInfoQueryOptions(clusterId, RESTART_POLL_MS), enabled: !!state && !!clusterId });

	if (!state) {
		return null;
	}
	// Mirrors what this page's own client does: a proxied one waits out a rolling container restart
	// too, because central manager refuses the cluster until the op completes.
	const held = holdsRequests(state, { proxied: !!entityId && connectsThroughProxy(entityId) });

	return (
		<div className={className}>
			<Alert variant="warning" role="status" aria-live="polite">
				<LoaderCircleIcon className="animate-spin" />
				<AlertTitle>{state.label} {noun}</AlertTitle>
				<AlertDescription>
					{held
						? `Studio is holding its requests to this ${noun} until it's back online, then refreshes what's shown here.`
						: 'Instances are restarting one at a time, so the cluster stays available. Brief connection errors are expected and hidden until it finishes.'}
				</AlertDescription>
			</Alert>
		</div>
	);
}
