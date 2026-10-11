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
import { deployFailureDetails } from '@/integrations/api/instance/applications/deployOutcome';
import { DeployRolloutError } from '@/integrations/api/instance/applications/restartJob';
import { SSEInconclusiveError } from '@/integrations/api/sse/errors';
import { invalidateEntityQueries } from '@/react-query/invalidateEntityQueries';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
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

export function useImportApplication(
	setIsReloading: (isReloading: boolean) => void,
) {
	const { mutate, isPending: isImportingApplication } = useDeployComponentMutation();

	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const sseDeploy = useSupportsDeploymentSSE();
	const canStage = useStagedDeploymentsAvailable();
	const runHealthCheck = useComponentHealthCheck(instanceParams);
	const recordAction = useDeploymentRecordAction();
	const { reloadRootEntries, setFocusedItem, setExpandedItems, setSelectedItems } = useEditorView();

	const onImported = useCallback((project: string) => {
		setIsReloading(true);
		void invalidateEntityQueries(queryClient, instanceParams.entityId);
		void reloadRootEntries();
		setFocusedItem(project);
		setSelectedItems([project]);
		setExpandedItems([project]);
	}, [
		queryClient,
		instanceParams.entityId,
		reloadRootEntries,
		setFocusedItem,
		setSelectedItems,
		setExpandedItems,
		setIsReloading,
	]);

	const callback = useCallback(({
		contents,
		project,
	}: {
		contents: z.infer<typeof ImportSchema>;
		project: string;
	}) => {
		const stage = canStage && contents.stageOnly;
		const toastId = toast.loading(stage ? 'Staging application...' : 'Importing application...', {
			description: 'This may take a bit.',
			duration: 300_000,
		});
		mutate({
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
					toast.loading(`${stage ? 'Staging' : 'Importing'} ${project}…`, {
						id: toastId,
						description: PHASE_LABELS[event.data.phase] ?? event.data.phase,
						duration: 300_000,
					});
				} else if (event.type === 'install' && event.data.line?.trim()) {
					toast.loading(`${stage ? 'Staging' : 'Importing'} ${project}…`, {
						id: toastId,
						description: event.data.line.trim().slice(0, 140),
						duration: 300_000,
					});
				} else if (event.type === 'rollout' && event.data.state === 'following') {
					toast.loading(`${stage ? 'Staging' : 'Importing'} ${project}…`, {
						id: toastId,
						description: 'Rolling out to the other nodes…',
						duration: Infinity,
					});
				}
			},
			...instanceParams,
		}, {
			onSuccess: async (result) => {
				toast.dismiss(toastId);
				if (stage) {
					// Nothing went live, so there is no new application in the tree to open.
					reportStaged(project, result, { action: recordAction(result?.deployment_id) });
					return;
				}
				onImported(project);
				// A followed rollout restarted the other nodes, so there is a health to check however the deploy was sent.
				if (sseDeploy || result?.rollout) {
					await reportDeployOutcome(project, result, runHealthCheck, {
						action: recordAction(result?.deployment_id),
					});
				} else {
					toast.success(`Imported successfully`, {
						description: `${project} will be available once you restart your ${instanceParams.entityType}!`,
						duration: 5_000,
					});
				}
			},
			onError: async (error) => {
				toast.dismiss(toastId);
				// Live stream dropped after the deploy started — verify rather than assume failure.
				if (error instanceof SSEInconclusiveError && stage) {
					toast.warning(`${project} may not be staged`, {
						description: 'Live updates ended before the stage finished. Check Deployments for its record.',
					});
					return;
				}
				if (error instanceof SSEInconclusiveError) {
					onImported(project);
					await reportDeployOutcome(project, undefined, runHealthCheck);
					return;
				}
				const action = recordAction(deployFailureDetails(error).deploymentId);
				if (error instanceof DeployRolloutError) {
					onImported(project);
					toast.error(`${project} did not reach every node`, { description: error.message, action });
					return;
				}
				toast.error(`Failed to ${stage ? 'stage' : 'import'} ${project}`, {
					description: error instanceof Error ? error.message : undefined,
					action,
				});
			},
		});
	}, [mutate, sseDeploy, canStage, instanceParams, runHealthCheck, onImported, recordAction]);

	return useMemo(() => ({
		isImportingApplication,
		importApplication: callback,
	}), [isImportingApplication, callback]);
}
