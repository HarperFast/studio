import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useComponentHealthCheck } from '@/features/instance/applications/hooks/useComponentHealthCheck';
import { useDeploymentRecordAction } from '@/features/instance/applications/hooks/useDeploymentRecordAction';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import {
	useStagedDeploymentsAvailable,
	useSupportsDeploymentSSE,
} from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { reportDeployOutcome, reportStaged } from '@/features/instance/applications/modals/reportDeployHealth';
import { useDeployComponentMutation } from '@/integrations/api/instance/applications/deployComponent';
import { DeployComponentResult } from '@/integrations/api/instance/applications/deployComponentStream';
import { deployFailureDetails } from '@/integrations/api/instance/applications/deployOutcome';
import { DeployRolloutError } from '@/integrations/api/instance/applications/restartJob';
import { SSEInconclusiveError } from '@/integrations/api/sse/errors';
import { invalidateEntityQueries } from '@/react-query/invalidateEntityQueries';
import { describeError } from '@/react-query/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ImportSchema } from './schema';

const PHASE_LABELS: Record<string, string> = {
	prepare: 'Preparing…',
	load: 'Loading component…',
	replicate: 'Replicating to nodes…',
	restart: 'Restarting…',
	success: 'Finishing…',
};

export interface ImportFailure {
	title: string;
	message: string;
	deploymentId?: string;
}

interface ImportArgs {
	contents: z.infer<typeof ImportSchema>;
	project: string;
}

export function useImportApplication(
	setIsReloading: (isReloading: boolean) => void,
) {
	const { mutateAsync, isPending: isImportingApplication } = useDeployComponentMutation();
	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	type EntityId = typeof instanceParams.entityId;
	const [importFailure, setImportFailure] = useState<{ entityId: EntityId; failure: ImportFailure }>();
	// The instance whose form is on screen, if any: this hook outlives a switch to another instance's form.
	const formEntity = useRef<EntityId>(undefined);
	useEffect(() => {
		formEntity.current = instanceParams.entityId;
		return () => {
			formEntity.current = undefined;
		};
	}, [instanceParams.entityId]);
	const sseDeploy = useSupportsDeploymentSSE();
	const canStage = useStagedDeploymentsAvailable();
	const runHealthCheck = useComponentHealthCheck(instanceParams);
	const recordAction = useDeploymentRecordAction();
	const { reloadRootEntries, setFocusedItem, setExpandedItems, setSelectedItems } = useEditorView();

	const onImported = useCallback((project: string, entityId: EntityId) => {
		void invalidateEntityQueries(queryClient, entityId);
		void reloadRootEntries();
		// Someone who left the form mid-import is looking at something else; leave their selection be.
		if (formEntity.current !== entityId) {
			return;
		}
		setIsReloading(true);
		setFocusedItem(project);
		setSelectedItems([project]);
		setExpandedItems([project]);
	}, [
		queryClient,
		reloadRootEntries,
		setFocusedItem,
		setSelectedItems,
		setExpandedItems,
		setIsReloading,
	]);

	const runImport = useCallback(async ({ contents, project }: ImportArgs) => {
		const { entityId } = instanceParams;
		setImportFailure(undefined);
		const stage = canStage && contents.stageOnly;
		const progressTitle = `${stage ? 'Staging' : 'Importing'} ${project}…`;
		const toastId = toast.loading(stage ? 'Staging application...' : 'Importing application...', {
			description: 'This may take a bit.',
			duration: 300_000,
		});
		let result: DeployComponentResult;
		try {
			result = await mutateAsync({
				request: {
					kind: stage ? 'stage' : 'deploy',
					project,
					package: contents.ref,
					installCommand: contents.installCommand,
				},
				useSSE: sseDeploy,
				onEvent: (event) => {
					// Stream live progress into the loading toast: phase transitions, and the latest
					// install output line during the install/load phase (so npm output shows through).
					if (event.type === 'phase' && event.data.status === 'start') {
						toast.loading(progressTitle, {
							id: toastId,
							description: PHASE_LABELS[event.data.phase] ?? event.data.phase,
							duration: 300_000,
						});
					} else if (event.type === 'install' && event.data.line?.trim()) {
						toast.loading(progressTitle, {
							id: toastId,
							description: event.data.line.trim().slice(0, 140),
							duration: 300_000,
						});
					} else if (event.type === 'rollout' && event.data.state === 'following') {
						toast.loading(progressTitle, {
							id: toastId,
							description: 'Rolling out to the other nodes…',
							duration: Infinity,
						});
					}
				},
				...instanceParams,
			});
		} catch (error) {
			toast.dismiss(toastId);
			// Live stream dropped after the deploy started — verify rather than assume failure.
			if (error instanceof SSEInconclusiveError && stage) {
				toast.warning(`${project} may not be staged`, {
					description: 'Live updates ended before the stage finished. Check Deployments for its record.',
				});
				return;
			}
			if (error instanceof SSEInconclusiveError) {
				onImported(project, entityId);
				await reportDeployOutcome(project, undefined, runHealthCheck);
				return;
			}
			const { deploymentId } = deployFailureDetails(error);
			if (error instanceof DeployRolloutError) {
				// Live on the node that received it, which opens it in the editor in place of this form.
				onImported(project, entityId);
				toast.error(`${project} did not reach every node`, {
					description: error.message,
					action: recordAction(deploymentId),
				});
				return;
			}
			const title = `Failed to ${stage ? 'stage' : 'import'} ${project}`;
			const { message } = describeError(error);
			if (formEntity.current === entityId) {
				setImportFailure({ entityId, failure: { title, message, deploymentId } });
			} else {
				toast.error(title, { description: message, action: recordAction(deploymentId) });
			}
			return;
		}
		toast.dismiss(toastId);
		if (stage) {
			// Nothing went live, so there is no new application in the tree to open.
			reportStaged(project, result, { action: recordAction(result?.deployment_id) });
			return;
		}
		onImported(project, entityId);
		// A followed rollout restarted the other nodes, so there is a health to check however the deploy was sent.
		if (sseDeploy || result?.rollout) {
			await reportDeployOutcome(project, result, runHealthCheck, { action: recordAction(result?.deployment_id) });
		} else {
			toast.success(`Imported successfully`, {
				description: `${project} will be available once you restart your ${instanceParams.entityType}!`,
				duration: 5_000,
			});
		}
	}, [mutateAsync, sseDeploy, canStage, instanceParams, runHealthCheck, onImported, recordAction]);

	const importApplication = useCallback((args: ImportArgs) => void runImport(args), [runImport]);

	const shownFailure = importFailure?.entityId === instanceParams.entityId ? importFailure.failure : undefined;
	return useMemo(() => ({
		isImportingApplication,
		importApplication,
		importFailure: shownFailure,
	}), [isImportingApplication, importApplication, shownFailure]);
}
