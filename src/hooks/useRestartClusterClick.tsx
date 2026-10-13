import { ProgressBar } from '@/components/ProgressBar';
import { ClusterRestartTargets, getClusterRestartTargets } from '@/hooks/getClusterRestartTargets';
import { getInstanceUserInfo } from '@/integrations/api/instance/status/getInstanceUserInfo';
import {
	RESTART_MARK_TTL_MS,
	restartInstance,
	waitUntilAnsweringAfterRestart,
} from '@/integrations/api/instance/status/restartInstance';
import {
	describeUncertainRollingOutcome,
	RestartUnconfirmedError,
} from '@/integrations/api/instance/status/restartUnconfirmed';
import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { pluralize } from '@/lib/pluralize';
import { markRestarting } from '@/lib/restart/restartTracker';
import { sleep } from '@/lib/sleep';
import { useParams } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

interface RestartClusterClickParams {
	onRestartedSuccessfully?: () => void;
}

interface RestartClusterClickResponse {
	onRestartClick: () => void;
	isRestartPending: boolean;
}

export function useRestartClusterClick(
	{ onRestartedSuccessfully }: RestartClusterClickParams = {},
): RestartClusterClickResponse {
	const { clusterId }: { clusterId?: string } = useParams({ strict: false });
	const [isRestartPending, setIsRestartPending] = useState(false);
	const onRestartClick = useCallback(async () => {
		if (!clusterId) {
			throw new Error('clusterId must be set in the route to invoke useRestartClusterClick');
		}
		setIsRestartPending(true);

		let canceled = false;
		const toastConfig = {
			duration: 60_000,
			action: {
				label: 'Cancel',
				onClick: () => {
					canceled = true;
				},
			},
		};

		// Once Cancel is clicked its toast is gone, and a progress toast offering Cancel again would read as if
		// it had not landed: say so instead.
		const progress = (description: string, onceCanceled = description) =>
			canceled
				? {
					duration: toastConfig.duration,
					description: `${onceCanceled} Cancelled: no other instance will be restarted.`.trim(),
				}
				: { ...toastConfig, description };

		const toastId = toast.loading('Restarting', {
			...toastConfig,
			description: (
				<ProgressBar
					animated={true}
					width="0%"
				/>
			),
		});

		try {
			let plan: ClusterRestartTargets;
			try {
				plan = await getClusterRestartTargets(clusterId);
			} catch {
				toast.error('Error', {
					id: toastId,
					description: "Could not load the cluster's instances, so nothing was restarted.",
					duration: 10_000,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
				return;
			}
			const { allInstances, targets } = plan;
			let instancesRestarted = 0;
			let instancesUnanswered = 0;
			let instancesFailed = 0;
			let instancesUntouched: number | undefined;
			let instancesStoppedOnNoVerdict = false;

			// One instance at a time, so the cluster stays reachable through the others unless it has only
			// one. The TTLs only matter if this loop dies without reaching `finally`.
			const releaseCluster = markRestarting([clusterId], {
				reach: targets.length === 1 ? 'down' : 'rolling',
				ttlMs: (targets.length + 1) * RESTART_MARK_TTL_MS,
			});

			try {
				for (let i = 0; i < targets.length; i++) {
					const { instance, instanceClient } = targets[i];
					if (!canceled) {
						toast.loading(`Restarting Instance ${i + 1} of ${targets.length}`, {
							...toastConfig,
							id: toastId,
							description: (
								<ProgressBar
									animated={true}
									width={(i === 0 ? 0 : (i / targets.length * 100)) + '%'}
								/>
							),
						});
						let releaseInstance: (() => void) | undefined;
						try {
							// Make sure the instance is responding. Ungated, so an instance central manager already
							// reports as restarting fails here instead of stalling the loop.
							await getInstanceUserInfo({
								instanceClient,
								skipRestartGate: true,
							});
							if (canceled) {
								break;
							}
							releaseInstance = markRestarting([instance.id], {
								reach: 'down',
								ttlMs: RESTART_MARK_TTL_MS,
							});
							// Then restart it.
							await restartInstance({
								operation: 'restart',
								replicated: false,
								instanceClient,
								onSlowToReturn: () =>
									toast.loading(`Waiting On Instance ${i + 1} of ${targets.length}`, {
										id: toastId,
										...progress("It accepted the restart but isn't back yet."),
									}),
							});
							instancesRestarted += 1;
						} catch (error) {
							if (error instanceof RestartUnconfirmedError) {
								// It may still be down: restarting the next one could leave no member serving.
								instancesUntouched = targets.length - i - 1;
								break;
							}
							const unanswered = isUnansweredWrite(error);
							instancesUnanswered += unanswered ? 1 : 0;
							instancesFailed += unanswered ? 0 : 1;
							if (unanswered) {
								// A gateway can lose the answer to a restart that ran and took this member down, so it
								// stays marked, and the next one waits, until it answers again or the watch gives up.
								toast.loading(`Could Not Confirm Instance ${i + 1} of ${targets.length}`, {
									id: toastId,
									...progress('Waiting for it to answer before carrying on.', 'Waiting for it to answer.'),
								});
								const back = await waitUntilAnsweringAfterRestart({ instanceClient }).then(() => true, () => false);
								if (!back) {
									// As down as a member that accepted the restart and is not back: stop here too.
									instancesUntouched = targets.length - i - 1;
									instancesStoppedOnNoVerdict = true;
									break;
								}
							}
							if (i + 1 !== targets.length) {
								// If it fails to restart, or wasn't available, warn for a bit then move on.
								const verdict = unanswered ? 'Could Not Confirm' : 'Failed Restarting';
								toast.loading(`${verdict} Instance ${i + 1} of ${targets.length}`, {
									id: toastId,
									...progress('We will carry on momentarily.', ''),
								});
								await sleep(3000);
							}
						} finally {
							releaseInstance?.();
						}
					}
				}
			} finally {
				// Releasing refetches the cluster's queries (`onRestartSettled`).
				releaseCluster();
			}

			const uncertain = describeUncertainRollingOutcome({
				total: allInstances.length,
				confirmed: instancesRestarted,
				failed: instancesFailed,
				unanswered: instancesUnanswered,
				untouched: instancesUntouched,
				stoppedOnNoVerdict: instancesStoppedOnNoVerdict,
				// Every member Cancel reached first lands in none of the counts.
				canceled: canceled && instancesUntouched === undefined
					? targets.length - instancesRestarted - instancesFailed - instancesUnanswered
					: 0,
			}, 'restarted');
			if (canceled && !uncertain) {
				toast.error('Cancelled', {
					id: toastId,
					description: `The restart was partially cancelled.`,
					duration: 10_000,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			} else if (allInstances.length > 0 && allInstances.length === instancesRestarted) {
				onRestartedSuccessfully?.();
				toast.success('Success', {
					id: toastId,
					description: `Cluster fully restarted!`,
					duration: 10_000,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			} else {
				const allTheInstances = pluralize(allInstances.length, 'instance', 'instances');
				const someRunningInstancesWere = pluralize(
					instancesRestarted,
					'"RUNNING" instance was',
					'"RUNNING" instances were',
				);
				toast.error(uncertain?.title ?? 'Error', {
					id: toastId,
					description: uncertain?.description
						?? `Failed to fully restart cluster.\n`
							+ ([
								allInstances.length === 0 && 'No instances were found within the cluster to restart.',
								targets.length === 0 && `No instances were in a "RUNNING" state of ${allTheInstances}.`,
								allInstances.length !== instancesRestarted
								&& `Only ${someRunningInstancesWere} restarted of ${allTheInstances}.`,
							].filter(excludeFalsy).shift() || ''),
					duration: 10_000,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			}
		} finally {
			setIsRestartPending(false);
		}
	}, [clusterId, onRestartedSuccessfully]);

	return {
		onRestartClick,
		isRestartPending,
	};
}
