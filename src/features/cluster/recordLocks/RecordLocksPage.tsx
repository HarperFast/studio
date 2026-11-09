import { ContactUs } from '@/components/ContactUs';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alertDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { SubmitErrorMessage } from '@/features/auth/components/SubmitErrorMessage';
import { ClusterContentWithSubNavMenu } from '@/features/cluster/components/ClusterContentWithSubNavMenu';
import { clusterReadRequestedSince, getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/integrations/api/api.patch';
import { describeError } from '@/react-query/queryClient';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { LoaderCircleIcon, LockIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { forgetSave, PendingSave, pendingSave } from './pendingRecordLocksSaves';
import {
	hasMemberNotRunning,
	RECORD_LOCKS_MIN_VERSION,
	recordLocksBlocker,
	RecordLocksPhase,
	recordLocksState,
} from './recordLocksState';
import { useSetClusterRecordLocks } from './useSetClusterRecordLocks';

const ROLL_POLL_MS = 5_000;
// Slower: a stopped roll waits on someone recovering an instance, which Try again needs to see.
const STOPPED_POLL_MS = 15_000;

/**
 * Central manager starts the roll's UPDATING write before it answers the PUT but doesn't wait for it,
 * so a read right after a save can still find the cluster RUNNING with members disagreeing: the
 * picture a roll that stopped part way leaves. Until the page sees the roll, or this long passes,
 * it reads that picture as the roll starting.
 */
export const ROLL_START_GRACE_MS = 60_000;

export function RecordLocksPage() {
	const { organizationId, clusterId } = useParams({ strict: false }) as {
		organizationId: string;
		clusterId: string;
	};
	const { update } = useOrganizationClusterPermissions(organizationId, clusterId);
	const { data: cluster, isLoading, error } = useQuery(getClusterInfoQueryOptions(clusterId));

	return (
		<ClusterContentWithSubNavMenu className="max-w-4xl pb-20">
			{isLoading
				? <TextLoadingSkeleton />
				: !cluster
				? (
					<Alert variant="destructive">
						<TriangleAlertIcon />
						<AlertTitle>The cluster couldn't be loaded</AlertTitle>
						<AlertDescription>{error ? describeError(error).message : 'Please try again.'}</AlertDescription>
					</Alert>
				)
				: (
					// Keyed: moving between clusters' pages reuses this route component, and none of this
					// page's state belongs to another cluster.
					<RecordLocksSettings key={cluster.id} cluster={cluster} organizationId={organizationId} canUpdate={update} />
				)}
		</ClusterContentWithSubNavMenu>
	);
}

interface Confirming {
	open: boolean;
	target: boolean;
	/** Re-sending the cluster's own setting to finish a roll that stopped part way. */
	resume: boolean;
}

const PHASE_BADGES: Record<RecordLocksPhase, { label: string; variant: 'success' | 'secondary' | 'warning' }> = {
	on: { label: 'On', variant: 'success' },
	off: { label: 'Off', variant: 'secondary' },
	applying: { label: 'Updating', variant: 'warning' },
	stopped: { label: 'Not finished', variant: 'warning' },
};

export function RecordLocksSettings({ cluster, organizationId, canUpdate }: {
	cluster: Cluster;
	organizationId: string;
	canUpdate: boolean;
}) {
	const switchId = useId();
	const skipDrainId = useId();
	const state = recordLocksState(cluster);
	// The rest outlives `open` so the dialog keeps its wording while it animates closed.
	const [confirming, setConfirming] = useState<Confirming>({ open: false, target: true, resume: false });
	const [skipDrain, setSkipDrain] = useState(false);
	const confirm = (target: boolean, resume: boolean) => {
		setSkipDrain(false);
		setConfirming({ open: true, target, resume });
	};
	const [saved, setSaved] = useState<PendingSave | null>(() => pendingSave(cluster.id));
	const [graceOverFor, setGraceOverFor] = useState<PendingSave | null>(null);
	const { mutate, isPending, error, reset } = useSetClusterRecordLocks();

	const phase: RecordLocksPhase = saved ? 'applying' : state.phase;
	const enabled = saved ? saved.target : state.enabled;
	// The cluster query is shared, so this joins any other poller rather than adding one.
	const { dataUpdatedAt } = useQuery({
		...getClusterInfoQueryOptions(cluster.id, phase === 'applying' ? ROLL_POLL_MS : STOPPED_POLL_MS),
		enabled: phase === 'applying' || phase === 'stopped',
	});

	useEffect(() => {
		if (!saved) {
			return;
		}
		const seen = state.enabled === saved.target && state.phase !== 'stopped';
		// After the grace, only a read requested since the save may stand in for it: when every poll has
		// failed, the cache still holds the cluster from before the save, and a read that merely finished
		// after the save may have been answered before it. `dataUpdatedAt` re-runs this when a read lands.
		const outlived = graceOverFor === saved && clusterReadRequestedSince(cluster.id, saved.at);
		if (seen || hasMemberNotRunning(cluster) || outlived) {
			forgetSave(cluster.id, saved);
			setSaved(null);
		}
	}, [cluster, dataUpdatedAt, graceOverFor, saved, state.enabled, state.phase]);
	useEffect(() => {
		if (!saved) {
			return;
		}
		const timer = setTimeout(
			() => setGraceOverFor(saved),
			Math.max(0, saved.savedAt + ROLL_START_GRACE_MS - Date.now()),
		);
		return () => clearTimeout(timer);
	}, [saved]);

	const toggleBlocker = recordLocksBlocker(cluster, !state.enabled);
	const resumeBlocker = recordLocksBlocker(cluster, state.enabled);
	const badge = PHASE_BADGES[phase];

	const send = (recordLocks: boolean, skipGtmWait: boolean) => {
		reset();
		mutate({ clusterId: cluster.id, organizationId, recordLocks, skipGtmWait }, {
			onSuccess: () => setSaved(pendingSave(cluster.id)),
			onError: () => setSaved(pendingSave(cluster.id)),
		});
	};

	return (
		<div className="space-y-6">
			<header>
				<h1 className="text-2xl font-light text-foreground">Record Locks</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Lock a record across the whole cluster, so two requests can't change it at the same time.
				</p>
			</header>

			<Card className="gap-0 py-0">
				<CardHeader className="flex flex-row items-start justify-between gap-4 border-b py-5">
					<div className="min-w-0 space-y-1.5">
						<h2 className="flex items-center gap-2 text-base font-semibold">
							<LockIcon className="size-4 text-primary" aria-hidden="true" />
							<label htmlFor={switchId}>Cluster-wide record locks</label>
						</h2>
						<CardDescription>
							Needs Harper {RECORD_LOCKS_MIN_VERSION}{' '}
							or later. Changing it restarts the cluster's instances one at a time.
						</CardDescription>
					</div>
					<div className="flex shrink-0 items-center gap-3">
						<Badge variant={badge.variant}>{badge.label}</Badge>
						<Switch
							id={switchId}
							checked={enabled}
							disabled={!canUpdate || isPending || phase !== 'on' && phase !== 'off' || !!toggleBlocker}
							onCheckedChange={(checked) => confirm(checked, false)}
						/>
					</div>
				</CardHeader>
				<CardContent className="space-y-4 py-5 text-sm">
					{!canUpdate && (
						<p className="text-muted-foreground">You need permission to update this cluster to change this.</p>
					)}
					{phase === 'applying' && (
						<Alert variant="warning" role="status" aria-live="polite">
							<LoaderCircleIcon className="animate-spin" />
							<AlertTitle>Turning record locks {enabled ? 'on' : 'off'}</AlertTitle>
							<AlertDescription>
								Central manager is restarting the instances one at a time, and the cluster shows as updating until they
								are all back.{' '}
								{state.enabled === enabled && state.total > 0 && `${state.applied} of ${state.total} done.`}
							</AlertDescription>
						</Alert>
					)}
					{phase === 'stopped' && (
						<Alert variant="warning">
							<TriangleAlertIcon />
							<AlertTitle>Record locks didn't finish turning {state.enabled ? 'on' : 'off'}</AlertTitle>
							<AlertDescription>
								<p>
									{state.applied} of {state.total} instances have record locks{' '}
									{state.enabled ? 'on' : 'off'}. The restarts stopped part way. Once every instance is running again,
									try again: instances already done are not restarted again.
								</p>
								{resumeBlocker && <RefusalMessage refusal={resumeBlocker} />}
								{canUpdate && (
									<Button
										className="mt-2"
										size="sm"
										variant="positiveOutline"
										disabled={isPending || !!resumeBlocker}
										onClick={() => confirm(state.enabled, true)}
									>
										{isPending ? 'Sending…' : 'Try again'}
									</Button>
								)}
							</AlertDescription>
						</Alert>
					)}
					{canUpdate && (phase === 'on' || phase === 'off') && toggleBlocker && (
						<div className="space-y-1">
							<RefusalMessage refusal={toggleBlocker} />
							{toggleBlocker.needsUpgrade && (
								<Link className="text-sm underline" to={`/${organizationId}/${cluster.id}/edit/version`}>
									Change the Harper version
								</Link>
							)}
						</div>
					)}
					<SubmitErrorMessage message={error ? describeError(error).message : undefined} />
					<RecordLocksExplanation />
				</CardContent>
			</Card>

			<AlertDialog open={confirming.open} onOpenChange={(open) => setConfirming(current => ({ ...current, open }))}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{confirming.resume
								? `Finish turning record locks ${confirming.target ? 'on' : 'off'}?`
								: `Turn record locks ${confirming.target ? 'on' : 'off'}?`}
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-2">
								<p>
									Central manager restarts {confirming.resume
										? 'the instances that still need it'
										: `the cluster's ${state.total === 1 ? 'instance' : `${state.total} instances`}`} one at a time.
									{' '}
									{skipDrain
										? 'Each one restarts right away, while it still takes traffic.'
										: 'Each one is drained of traffic first, so it can take several minutes per instance.'}{' '}
									The cluster shows as updating until they are all back, and can't take other changes until then.
								</p>
								{!confirming.target && (
									<p>
										While record locks are off, <code>lock()</code>{' '}
										on a table that replicates fails, and an instance removed from the cluster meanwhile can stop them
										turning back on until central manager knows it is gone for good.
									</p>
								)}
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="space-y-1 text-sm">
						<div className="flex items-center gap-2">
							<input
								id={skipDrainId}
								type="checkbox"
								className="size-4 cursor-pointer"
								checked={skipDrain}
								onChange={(event) => setSkipDrain(event.target.checked)}
							/>
							<label htmlFor={skipDrainId} className="cursor-pointer font-medium">Immediate restart</label>
						</div>
						<p className="text-muted-foreground">
							Restart each instance without waiting for it to be taken out of the load balancer (faster, but requests it
							receives while restarting can fail).
						</p>
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction disabled={isPending} onClick={() => send(confirming.target, skipDrain)}>
							{confirming.resume ? 'Try again' : `Turn ${confirming.target ? 'on' : 'off'}`}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function RefusalMessage({ refusal }: { refusal: { message: string; needsSupport: boolean } }) {
	return (
		<p className="text-sm text-muted-foreground">
			{refusal.message}
			{refusal.needsSupport && (
				<>
					{' '}
					<ContactUs /> if you need help with it.
				</>
			)}
		</p>
	);
}

function RecordLocksExplanation() {
	return (
		<ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
			<li>
				With record locks on, <code>lock()</code>{' '}
				in your application code locks a record across every instance in the cluster.
			</li>
			<li>
				With them off, <code>lock()</code> on a table that replicates fails with a 503 error. Only{' '}
				<code>lock({'{'} scope: 'node' {'}'})</code> works, and it locks on one instance only.
			</li>
			<li>
				Record locks need the RocksDB storage engine, which is Harper 5's default. On an instance set to the older LMDB
				engine, <code>lock()</code> doesn't work at all.
			</li>
			<li>Instances added to the cluster later get the setting automatically.</li>
		</ul>
	);
}
