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
import {
	invalidateApplicationConfiguration,
	useApplicationBranchedDatabases,
	useBranchedDatabasesAvailable,
} from '@/features/instance/applications/hooks/useBranchedDatabases';
import { useComponentHealthCheck } from '@/features/instance/applications/hooks/useComponentHealthCheck';
import { useDeploymentRecordAction } from '@/features/instance/applications/hooks/useDeploymentRecordAction';
import {
	useStagedDeploymentsAvailable,
	useSupportsDeploymentSSE,
} from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { reportDeployFailure, reportDeployOutcome } from '@/features/instance/applications/modals/reportDeployHealth';
import { describeBranchedDatabases } from '@/integrations/api/instance/applications/branchedDatabases';
import { useDeployComponentMutation } from '@/integrations/api/instance/applications/deployComponent';
import { deployFailureDetails } from '@/integrations/api/instance/applications/deployOutcome';
import { DeployRolloutError } from '@/integrations/api/instance/applications/restartJob';
import { SSEInconclusiveError } from '@/integrations/api/sse/errors';
import { isUnansweredWrite, UNANSWERED_WRITE_MESSAGE } from '@/integrations/api/unansweredWrite';
import { invalidateEntityQueries } from '@/react-query/invalidateEntityQueries';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { RocketIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

/** Keyed by the release, so every record of it (its own, each activation of it) shares one pending activation. */
export function activationMutationKey(entityId: string | undefined, releaseId: string) {
	return ['activate_deployment', entityId, releaseId] as const;
}

/**
 * `activate`: a staged release nothing made live. `rollback`: a release a later deploy replaced. `again`: a release that
 * may not be live everywhere, because a deploy failed or some node did not take it.
 */
export type ActivationIntent = 'activate' | 'rollback' | 'again';

const BUTTON_LABEL: Record<ActivationIntent, string> = {
	activate: 'Activate',
	rollback: 'Roll back to this release',
	again: 'Activate again',
};

/** A staged release and a kept one are activated alike: `deploy_component { deployment_id }`, certified and followed. */
export function ActivateRelease({
	project,
	releaseId: deploymentId,
	intent = 'activate',
	offer = true,
	disabled = false,
	revalidate,
}: {
	project: string;
	/** The id of the deployment that built it: an activation's `activated_from`, or a deploy's own id. */
	releaseId: string;
	intent?: ActivationIntent;
	/** Whether it is worth offering. The progress of an activation started here shows either way. */
	offer?: boolean;
	/** Offered but refused: some node holds no copy. The caller says which. */
	disabled?: boolean;
	/**
	 * Asks the nodes again before confirming, resolving to whether their answer still allows it: what they hold changes
	 * without a newer record, as a rollout behind the newest one finishes or a node joins. The confirmation opens on that
	 * answer alone, since `disabled` reflects it only a render later.
	 */
	revalidate?: () => Promise<boolean>;
}) {
	const instanceParams = useInstanceClientIdParams();
	const queryClient = useQueryClient();
	const sseDeploy = useSupportsDeploymentSSE();
	const canActivate = useStagedDeploymentsAvailable();
	const stream = useDeploymentStream();
	const runHealthCheck = useComponentHealthCheck(instanceParams);
	const recordAction = useDeploymentRecordAction();
	const canBranch = useBranchedDatabasesAvailable();
	const currentBranches = useApplicationBranchedDatabases(canBranch ? project : undefined);
	// Keyed so a detail closed and reopened mid-rollout still knows this release is being activated.
	const mutationKey = useMemo(() => activationMutationKey(instanceParams.entityId, deploymentId), [
		instanceParams.entityId,
		deploymentId,
	]);
	const { mutateAsync } = useDeployComponentMutation(mutationKey);
	const isPending = useIsMutating({ mutationKey }) > 0;
	const [confirming, setConfirming] = useState(false);
	const [started, setStarted] = useState(false);
	const [revalidating, setRevalidating] = useState(false);
	const askToConfirm = useCallback(async () => {
		if (!revalidate) {
			setConfirming(true);
			return;
		}
		setRevalidating(true);
		let allowed = false;
		try {
			allowed = await revalidate();
		} catch {
			// The check it failed on says why.
		} finally {
			setRevalidating(false);
		}
		setConfirming(allowed);
	}, [revalidate]);

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
			void invalidateApplicationConfiguration(queryClient, instanceParams.entityId);
			void invalidateEntityQueries(queryClient, instanceParams.entityId);
			await reportDeployOutcome(project, result, runHealthCheck, { action: recordAction(result?.deployment_id) });
		} catch (error) {
			void invalidateApplicationConfiguration(queryClient, instanceParams.entityId);
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
				error instanceof DeployRolloutError
					? undefined
					: isUnansweredWrite(error)
					? UNANSWERED_WRITE_MESSAGE
					: error instanceof Error
					? error.message
					: String(error),
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

	// What this activation showed here outranks the records until they catch up, and where they cannot: the record
	// reads `success` before the rolling restart reaches the other nodes, and after it fails there.
	const lifecycle = started ? stream.state.lifecycle : 'idle';
	const retry = lifecycle === 'error' || lifecycle === 'inconclusive';
	const showButton = revalidating || isPending || retry || (offer && lifecycle !== 'success');
	const shownIntent = retry && !offer ? 'again' : intent;
	const confirmable = showButton && !disabled && !isPending;
	useEffect(() => {
		// Only a change closes it: a confirmation `revalidate` allowed opens while `disabled` still shows the ask.
		if (!confirmable) {
			setConfirming(false);
		}
	}, [confirmable]);

	if (!canActivate) {
		return null;
	}

	return (
		<>
			{showButton && (
				<Button
					variant="positiveOutline"
					className="self-start"
					onClick={() => void askToConfirm()}
					disabled={isPending || disabled || revalidating}
				>
					<RocketIcon /> {isPending ? 'Activating…' : revalidating ? 'Checking…' : BUTTON_LABEL[shownIntent]}
				</Button>
			)}
			{started && (
				<>
					<Separator />
					<DeployProgress state={stream.state} />
				</>
			)}
			<AlertDialog open={confirming && !isPending} onOpenChange={setConfirming}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{shownIntent === 'rollback'
								? `Roll ${project} back to this release?`
								: `Activate this release of ${project}${shownIntent === 'again' ? ' again' : ''}?`}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{shownIntent === 'rollback'
								? (
									<>
										Deployment <span className="font-mono">{deploymentId}</span>{' '}
										goes live again on all nodes, which restart one at a time. Each node kept this release installed
										when it was replaced, so it just switches back. A node that no longer keeps it refuses.
									</>
								)
								: shownIntent === 'again'
								? (
									<>
										Deployment <span className="font-mono">{deploymentId}</span>{' '}
										goes live on all nodes, which restart one at a time. It was installed when it was deployed or
										staged, so each node just switches to it, and a node already running it restarts without changing
										anything.
									</>
								)
								: (
									<>
										Deployment <span className="font-mono">{deploymentId}</span>{' '}
										goes live on all nodes, which restart one at a time. Everything was installed when this release was
										staged, so each node just switches to it.
									</>
								)}
						</AlertDialogDescription>
						<AlertDialogDescription>
							It also brings back the private database copy setting this release was deployed with, which Studio
							can&apos;t read. {currentBranches.known
								&& `${project} now runs on ${
									currentBranches.setting
										? `a private copy of ${describeBranchedDatabases(currentBranches.setting)}`
										: 'the shared databases'
								}.`}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => void activate()}>{BUTTON_LABEL[shownIntent]}</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
