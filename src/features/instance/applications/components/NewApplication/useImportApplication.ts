import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useDeployComponentMutation } from '@/integrations/api/instance/applications/deployComponent';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ImportSchema } from './schema';

export function useImportApplication(
	setIsReloading: (isReloading: boolean) => void,
) {
	const { mutate, isPending: isImportingApplication } = useDeployComponentMutation();

	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const { reloadRootEntries, setFocusedItem, setExpandedItems, setSelectedItems } = useEditorView();
	const callback = useCallback(({
		contents,
		project,
	}: {
		contents: z.infer<typeof ImportSchema>
		project: string,
	}) => {
		const toastId = toast.loading(`Importing application...`, {
			description: 'This may take a bit.',
			duration: 300_000,
		});
		mutate({
			applicationName: project,
			applicationUrl: contents.ref,
			installCommand: contents.installCommand,
			...instanceParams,
		}, {
			onSuccess: () => {
				toast.success(`Imported successfully`, {
					description: `${project} will be available once you restart your ${instanceParams.entityType}!`,
					id: toastId,
					duration: 5_000,
				});
				setIsReloading(true);
				void queryClient.invalidateQueries({ queryKey: [instanceParams.entityId] });
				void reloadRootEntries();
				setFocusedItem(project);
				setSelectedItems([project]);
				setExpandedItems([project]);
			},
			onError: () => {
				toast.dismiss(toastId);
			},
		});
	}, [mutate, queryClient, instanceParams, setIsReloading, reloadRootEntries, setFocusedItem, setExpandedItems, setSelectedItems]);

	return useMemo(() => ({
		isImportingApplication,
		importApplication: callback,
	}), [isImportingApplication, callback]);
}
