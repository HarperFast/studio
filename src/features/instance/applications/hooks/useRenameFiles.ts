import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { dropComponent } from '@/features/instance/operations/mutations/dropComponent';
import { setComponentFile } from '@/features/instance/operations/mutations/setComponentFile';
import { getComponentFile } from '@/features/instance/operations/queries/getComponentFile';
import { useCallback } from 'react';
import { toast } from 'sonner';

export function useRenameFiles() {
	const {
		reloadRootEntries,
		setFocusedItem,
		setSelectedItems,
	} = useEditorView();

	const instanceParams = useInstanceClientIdParams();

	return useCallback(async (changes: { from: string, to: string }[]) => {
		// TODO: Progress bar.
		const toastId = toast.loading('Renaming', {
			description: 'Loading existing contents...',
			duration: 0,
		});

		for (const change of changes) {
			if (change.from !== change.to) {
				const oldParts = change.from.split('/');
				const oldProject = oldParts.shift()!;
				const oldFile = oldParts.join('/');
				const newParts = change.to.split('/');
				const newProject = newParts.shift()!;
				const newFile = newParts.join('/');

				toast.loading('Renaming', {
					id: toastId,
					description: 'Loading existing contents...',
					duration: 0,
				});
				const fileContents = await getComponentFile({
					...instanceParams,
					file: oldFile,
					project: oldProject,
				});

				toast.loading('Renaming', {
					id: toastId,
					description: 'Copying to new location...',
					duration: 0,
				});
				await setComponentFile({
					...instanceParams,
					file: newFile,
					project: newProject,
					payload: fileContents.message,
				});

				toast.loading('Renaming', {
					id: toastId,
					description: 'Removing old copy...',
					duration: 0,
				});
				await dropComponent({
					...instanceParams,
					file: oldFile,
					project: oldProject,
				});
			}
		}

		toast.success('Renamed!', {
			id: toastId,
			description: 'All done!',
			duration: 3000,
		});

		// TODO:
		reloadRootEntries();

		// const existingIndex = change.from;
		// const newIndex = change.to;
		//
		// setSelectedItems(selectedItems => {
		// 	const selectedIndex = selectedItems.indexOf(existingIndex);
		// 	if (selectedIndex >= 0) {
		// 		return [
		// 			...selectedItems.slice(0, selectedIndex),
		// 			...selectedItems.slice(selectedIndex + 1),
		// 			newIndex,
		// 		];
		// 	}
		// 	return selectedItems;
		// });
		//
		// setFocusedItem(focusedItem => {
		// 	if (focusedItem === existingIndex) {
		// 		return newIndex;
		// 	}
		// 	return focusedItem;
		// });
	}, [instanceParams, reloadRootEntries, setFocusedItem, setSelectedItems]);
}
