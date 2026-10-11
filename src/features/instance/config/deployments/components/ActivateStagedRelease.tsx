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
import { SSEInconclusiveError } from '@/integrations/api/sse/errors';
import { invalidateEntityQueries } from '@/react-query/invalidateEntityQueries';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { RocketIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

export function activationMutationKey(entityId: string | undefined, deploymentId: string) {
	return ['activate_deployment', entityId, deploymentId] as const;
}

export function ActivateStagedRelease({ deployment }: { deployment: Deployment }) {
	const instanceParams = useInstanceClientIdParams();
	const queryClient = useQueryClient();
	const sseDeploy = useSupportsDeploymentSSE();
	const canActivate = useStagedDeploymentsAvailable();
	const stream = useDeploymentStream();
	const runHealthCheck = useComponentHealthCheck(instanceParams);
	const recordAction = useDeploymentRecordAction();
	const { project, deployment_id: deploymentId } = deployment;
	// Keyed so a detail closed and reopened mid-rollout still knows this release is being activated.
	const mutationKey = useMemo(() => activationMutationKey(instanceParams.entityId, deploymentId), [
		instanceParams.entityId,
		deploymentId,
	]);
	// Every outcome is reported below, so the global toast would only contradict an unknown one.
	const { mutateAsync } = useDeployComponentMutation(mutationKey, { skipGlobalErrorToast: true });
	const isPending = useIsMutating({ mutationKey }) > 0;
	const [confirming, setConfirming] = useState(false);
	const [started, setStarted] = useState(false);

	const activate = useCallback(async () => {
		setConfirming(false);
		setStarted(true);
		stream.reset();
		stream.markStarted();
		// Awaited here rather than in `mutate` callbacks, which React Query drops once this detail unmounts: the
		// report and the invalidation still belong to an activation someone closed the dialog on.
		try {
			const result = await mutateAsync({
				request: { kind: 'activate', project, deploymentId },
				useSSE: sseDeploy,
				onEvent: stream.onEvent,
				...instanceParams,
			});
			stream.markSettled(result?.rollout?.state === 'unfollowable' ? 'inconclusive' : 'success', undefined, {
				result,
			});
			void invalidateEntityQueries(queryClient, instanceParams.entityId);
			await reportDeployOutcome(project, result, runHealthCheck, { action: recordAction(result?.deployment_id) });
		} catch (error) {
			// What the skipped global handler would have done for Datadog; RUM reports `console.error` (AGENTS.md).
			console.error(error);
			void invalidateEntityQueries(queryClient, instanceParams.entityId);
			if (error instanceof SSEInconclusiveError) {
				stream.markSettled('inconclusive');
				toast.warning(`${project} may not be activated`, {
					description: 'Live updates ended before the activation finished. Check Deployments for its record.',
				});
				return;
			}
			stream.markSettled(
				'error',
				error instanceof DeployRolloutError ? undefined : error instanceof Error ? error.message : String(error),
				{ failure: error },
			);
			reportDeployFailure(project, error, 'activate', {
				action: recordAction(deployFailureDetails(error).deploymentId),
			});
		}
	}, [
		mutateAsync,
		project,
		deploymentId,
		sseDeploy,
		stream,
		instanceParams,
		queryClient,
		runHealthCheck,
		recordAction,
	]);

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
						<AlertDialogAction onClick={() => void activate()}>Activate</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
