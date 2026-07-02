import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useComponentHealthCheck } from '@/features/instance/applications/hooks/useComponentHealthCheck';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useSupportsDeploymentSSE } from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { reportDeployHealth } from '@/features/instance/applications/modals/reportDeployHealth';
import { useDeployComponentMutation } from '@/integrations/api/instance/applications/deployComponent';
import { SSEInconclusiveError } from '@/integrations/api/sse/errors';
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
	const runHealthCheck = useComponentHealthCheck(instanceParams);
	const { reloadRootEntries, setFocusedItem, setExpandedItems, setSelectedItems } = useEditorView();

	const onImported = useCallback((project: string) => {
		setIsReloading(true);
		void queryClient.invalidateQueries({ queryKey: [instanceParams.entityId] });
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
		const toastId = toast.loading(`Importing application...`, {
			description: 'This may take a bit.',
			duration: 300_000,
		});
		mutate({
			applicationName: project,
			applicationUrl: contents.ref,
			installCommand: contents.installCommand,
			useSSE: sseDeploy,
			onEvent: (event) => {
				// Stream live progress into the loading toast: phase transitions, and the latest
				// install output line during the install/load phase (so npm output shows through).
				if (event.type === 'phase' && event.data.status === 'start') {
					toast.loading(`Importing ${project}…`, {
						id: toastId,
						description: PHASE_LABELS[event.data.phase] ?? event.data.phase,
						duration: 300_000,
					});
				} else if (event.type === 'install' && event.data.line?.trim()) {
					toast.loading(`Importing ${project}…`, {
						id: toastId,
						description: event.data.line.trim().slice(0, 140),
						duration: 300_000,
					});
				}
			},
			...instanceParams,
		}, {
			onSuccess: async () => {
				toast.dismiss(toastId);
				onImported(project);
				if (sseDeploy) {
					reportDeployHealth(project, await runHealthCheck(project));
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
				if (error instanceof SSEInconclusiveError) {
					onImported(project);
					reportDeployHealth(project, await runHealthCheck(project));
					return;
				}
				toast.error(`Failed to import ${project}`, {
					description: error instanceof Error ? error.message : undefined,
				});
			},
		});
	}, [mutate, sseDeploy, instanceParams, runHealthCheck, onImported]);

	return useMemo(() => ({
		isImportingApplication,
		importApplication: callback,
	}), [isImportingApplication, callback]);
}
