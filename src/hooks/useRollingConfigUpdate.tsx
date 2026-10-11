import { ProgressBar } from '@/components/ProgressBar';
import { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getClusterRestartTargets } from '@/hooks/getClusterRestartTargets';
import { Instance } from '@/integrations/api/api.patch';
import { getInstanceUserInfo } from '@/integrations/api/instance/status/getInstanceUserInfo';
import { restartInstance } from '@/integrations/api/instance/status/restartInstance';
import {
	describeUncertainRollingOutcome,
	RestartUnconfirmedError,
} from '@/integrations/api/instance/status/restartUnconfirmed';
import { setConfiguration, shouldFanOutSetConfiguration } from '@/integrations/api/instance/status/setConfiguration';
import { acknowledgedReplicationNodes } from '@/integrations/api/replication';
import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { pluralize } from '@/lib/pluralize';
import { sleep } from '@/lib/sleep';
import { useQueryClient } from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

interface RollingConfigUpdateParams {
	onRestartedSuccessfully?: () => void;
}

interface RollingConfigUpdateResponse {
	onConfigUpdate: (params: Record<string, unknown>) => void;
	isPending: boolean;
}

const MAY_BE_PENDING =
	'Instances that were not restarted may already have the new configuration saved, and will apply it the next time they restart.';

interface RestartTarget {
	instanceClient: AxiosInstance;
	replicationFqdn?: string;
}

interface RollingConfigUpdatePlan {
	allInstances: Instance[];
	targets: RestartTarget[];
	fanOutAfterCanary: boolean;
}

async function planRollingConfigUpdate(
	operationsParams: InstanceClientIdConfig & InstanceTypeConfig,
): Promise<RollingConfigUpdatePlan> {
	if (operationsParams.entityType !== 'cluster') {
		return {
			allInstances: [{ id: operationsParams.entityId, status: 'RUNNING' } as Instance],
			targets: [{ instanceClient: operationsParams.instanceClient }],
			fanOutAfterCanary: false,
		};
	}
	const { allInstances, targets } = await getClusterRestartTargets(operationsParams.entityId);
	return {
		allInstances,
		targets: targets.map(({ instance, instanceClient }) => ({
			instanceClient,
			replicationFqdn: instance.replicationFqdn,
		})),
		fanOutAfterCanary: shouldFanOutSetConfiguration(allInstances),
	};
}

export function useRollingConfigUpdate(
	{ onRestartedSuccessfully }: RollingConfigUpdateParams = {},
): RollingConfigUpdateResponse {
	const operationsParams = useInstanceClientIdParams();
	const queryClient = useQueryClient();
	const [isPending, setIsPending] = useState(false);
	const onConfigUpdate = useCallback(async (params: Record<string, unknown>) => {
		setIsPending(true);

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
			let plan: RollingConfigUpdatePlan;
			try {
				plan = await planRollingConfigUpdate(operationsParams);
			} catch {
				toast.error('Error', {
					id: toastId,
					description: "Could not load the cluster's instances, so no configuration was changed.",
					duration: 10_000,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
				return;
			}
			const { allInstances, targets, fanOutAfterCanary } = plan;
			let fanOutAttempted = false;
			let acknowledged = new Set<string>();
			let instancesRestarted = 0;
			let instancesUnanswered = 0;
			let instancesFailed = 0;
			let instancesUntouched: number | undefined;

			for (let i = 0; i < targets.length; i++) {
				const { instanceClient, replicationFqdn } = targets[i];
				if (canceled) {
					break;
				}
				toast.loading(`Updating Instance ${i + 1} of ${targets.length}`, {
					...toastConfig,
					id: toastId,
					description: (
						<ProgressBar
							animated={true}
							width={(i === 0 ? 0 : (i / targets.length * 100)) + '%'}
						/>
					),
				});
				let restarted = false;
				try {
					// Make sure the instance is responding.
					await getInstanceUserInfo({
						instanceClient,
					});
					if (canceled) {
						break;
					}

					if (!replicationFqdn || !acknowledged.has(replicationFqdn.toLowerCase())) {
						await setConfiguration({
							...params,
							instanceClient,
						});
					}
					// Then restart it.
					await restartInstance({
						operation: 'restart_service',
						replicated: false,
						instanceClient,
						onSlowToReturn: () =>
							toast.loading(`Waiting On Instance ${i + 1} of ${targets.length}`, {
								...toastConfig,
								id: toastId,
								description: "It accepted the restart but hasn't answered yet.",
							}),
					});
					instancesRestarted += 1;
					restarted = true;
				} catch (error) {
					if (error instanceof RestartUnconfirmedError) {
						// It may still be down: updating the next one could leave no member serving. A canary that is
						// not back never proved it can run the configuration, so it is not fanned out either.
						instancesUntouched = targets.length - i - 1;
						break;
					}
					const unanswered = isUnansweredWrite(error);
					instancesUnanswered += unanswered ? 1 : 0;
					instancesFailed += unanswered ? 0 : 1;
					if (i + 1 !== targets.length) {
						// If it fails to restart, or wasn't available, warn for a bit then move on.
						const verdict = unanswered ? 'Could Not Confirm' : 'Failed Restarting';
						toast.loading(`${verdict} Instance ${i + 1} of ${targets.length}`, {
							...toastConfig,
							id: toastId,
							description: 'We will carry on momentarily.',
						});
						await sleep(3000);
					}
				}

				// The configuration spreads only once an instance has come back up running it, and a
				// later target skips its own write only if replication acknowledged that exact node.
				if (restarted && fanOutAfterCanary && !fanOutAttempted && !canceled) {
					fanOutAttempted = true;
					toast.loading('Saving configuration to the cluster', {
						...toastConfig,
						id: toastId,
						description: (
							<ProgressBar
								animated={true}
								width={((i + 1) / targets.length * 100) + '%'}
							/>
						),
					});
					acknowledged = await setConfiguration({
						...params,
						replicated: true,
						instanceClient,
					}).then(acknowledgedReplicationNodes, () => new Set<string>());
				}
			}

			const uncertain = describeUncertainRollingOutcome({
				total: allInstances.length,
				confirmed: instancesRestarted,
				failed: instancesFailed,
				unanswered: instancesUnanswered,
				untouched: instancesUntouched,
			}, 'updated');
			if (canceled && !uncertain) {
				toast.error('Cancelled', {
					id: toastId,
					description: `The config update was partially cancelled.${fanOutAttempted ? ` ${MAY_BE_PENDING}` : ''}`,
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
					description: `Your configuration has been updated successfully!`,
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
					description: (uncertain?.description
						?? `Failed to fully update cluster.\n`
							+ ([
								allInstances.length === 0 && 'No instances were found within the cluster to restart.',
								targets.length === 0 && `No instances were in a "RUNNING" state of ${allTheInstances}.`,
								allInstances.length !== instancesRestarted
								&& `Only ${someRunningInstancesWere} restarted of ${allTheInstances}.`,
							].filter(excludeFalsy).shift() || ''))
						+ (fanOutAttempted ? '\n' + MAY_BE_PENDING : ''),
					duration: 10_000,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			}
		} finally {
			setIsPending(false);
			void queryClient.invalidateQueries({ queryKey: ['get_configuration', operationsParams.entityId] });
		}
	}, [operationsParams, onRestartedSuccessfully, queryClient]);

	return {
		onConfigUpdate,
		isPending,
	};
}
