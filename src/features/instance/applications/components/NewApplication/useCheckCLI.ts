import { useInstanceClientParams } from '@/config/useInstanceClient';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { APIDirectoryEntry } from '@/features/instance/operations/queries/getComponents';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CLISchema } from './schema';

export function useCheckCLI(
	setIsReloading: (isReloading: boolean) => void,
) {
	const instanceParams = useInstanceClientParams();
	const { reloadRootEntries, setFocusedItem, setExpandedItems, setSelectedItems } = useEditorView();
	const callback = useCallback(({
		// contents,
		project,
	}: {
		contents: z.infer<typeof CLISchema>
		project: string,
	}) => {
		const toastId = toast.loading(`Looking for application...`, {
			description: 'This may take a bit.',
			duration: 300_000,
		});

		setIsReloading(true);
		reloadRootEntries().then((apiComponents: APIDirectoryEntry) => {
			const entries = apiComponents?.entries || [];
			for (const entry of entries) {
				if (entry.name.toLowerCase() === project.toLowerCase()) {
					setFocusedItem(entry.name);
					setSelectedItems([entry.name]);
					setExpandedItems([entry.name]);
					setIsReloading(false);
					toast.success(`Imported successfully`, {
						description: `${project} is now available in your ${instanceParams.entityType}!`,
						id: toastId,
						duration: 5_000,
					});
					return;
				}
			}

			toast.warning(`Deployment Not Detected`, {
				description: `I searched for ${project} but did not find it in the ${instanceParams.entityType} yet. Do you see it on the left? Did you use a different name, perhaps?`,
				id: toastId,
				duration: 10_000,
			});
			setIsReloading(false);
		});
	}, [instanceParams, setIsReloading, reloadRootEntries, setFocusedItem, setExpandedItems, setSelectedItems]);

	return useMemo(() => ({
		checkCLI: callback,
	}), [callback]);
}
