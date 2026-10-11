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
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { DeployProgress } from '@/features/instance/applications/components/DeployProgress/DeployProgress';
import { useDeploymentStream } from '@/features/instance/applications/components/DeployProgress/useDeploymentStream';
import { useComponentHealthCheck } from '@/features/instance/applications/hooks/useComponentHealthCheck';
import { useDeploymentRecordAction } from '@/features/instance/applications/hooks/useDeploymentRecordAction';
import {
	useStagedDeploymentsAvailable,
	useSupportsDeploymentSSE,
} from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { reportDeployFailure, reportDeployOutcome } from '@/features/instance/applications/modals/reportDeployHealth';
import { useDeployComponentMutation } from '@/integrations/api/instance/applications/deployComponent';
import { deployFailureDetails } from '@/integrations/api/instance/applications/deployOutcome';
import { DeployRolloutError } from '@/integrations/api/instance/applications/restartJob';
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { invalidateEntityQueries } from '@/react-query/invalidateEntityQueries';
import { useQueryClient } from '@tanstack/react-query';
import { RocketIcon } from 'lucide-react';
import { useCallback, useState } from 'react';

/**
 * Make a staged release live (Harper 5.3.0+), restarting each node in turn: `deploy_component` with its
 * `deployment_id`, followed like any other rolling deploy.
 */
export function ActivateStagedRelease({ deployment }: { deployment: Deployment }) {
	const instanceParams = useInstanceClientIdParams();
	const queryClient = useQueryClient();
	const sseDeploy = useSupportsDeploymentSSE();
	const canActivate = useStagedDeploymentsAvailable();
	const stream = useDeploymentStream();
	const runHealthCheck = useComponentHealthCheck(instanceParams);
	const recordAction = useDeploymentRecordAction();
	const { mutate, isPending } = useDeployComponentMutation();
	const [confirming, setConfirming] = useState(false);
	const [started, setStarted] = useState(false);
	const { project, deployment_id: deploymentId } = deployment;

	const activate = useCallback(() => {
		setConfirming(false);
		setStarted(true);
		stream.reset();
		stream.markStarted();
		mutate({
			request: { kind: 'activate', project, deploymentId },
			useSSE: sseDeploy,
			onEvent: stream.onEvent,
			...instanceParams,
		}, {
			onSuccess: async (result) => {
				stream.markSettled(result?.rollout?.state === 'unfollowable' ? 'inconclusive' : 'success', undefined, {
					result,
				});
				void invalidateEntityQueries(queryClient, instanceParams.entityId);
				await reportDeployOutcome(project, result, runHealthCheck, { action: recordAction(result?.deployment_id) });
			},
			onError: (error) => {
				stream.markSettled(
					'error',
					error instanceof DeployRolloutError ? undefined : error instanceof Error ? error.message : String(error),
					{ failure: error },
				);
				void invalidateEntityQueries(queryClient, instanceParams.entityId);
				reportDeployFailure(project, error, 'activate', {
					action: recordAction(deployFailureDetails(error).deploymentId),
				});
			},
		});
	}, [mutate, project, deploymentId, sseDeploy, stream, instanceParams, queryClient, runHealthCheck, recordAction]);

	if (!canActivate) {
		return null;
	}

	return (
		<>
			<Button
				variant="positiveOutline"
				className="self-start"
				onClick={() => setConfirming(true)}
				disabled={isPending}
			>
				<RocketIcon /> {isPending ? 'Activating…' : 'Activate'}
			</Button>
			{started && (
				<>
					<Separator />
					<DeployProgress state={stream.state} />
				</>
			)}
			<AlertDialog open={confirming} onOpenChange={setConfirming}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Activate this release of {project}?</AlertDialogTitle>
						<AlertDialogDescription>
							Deployment <span className="font-mono">{deploymentId}</span>{' '}
							goes live on every node, which restart one at a time. Nothing is installed: each node swaps in the release
							it staged.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={activate}>Activate</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
