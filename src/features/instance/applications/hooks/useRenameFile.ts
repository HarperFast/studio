import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { dropComponent } from '@/features/instance/operations/mutations/dropComponent';
import { setComponentFile } from '@/features/instance/operations/mutations/setComponentFile';
import { getComponentFile } from '@/features/instance/operations/queries/getComponentFile';
import { useCallback } from 'react';
import { toast } from 'sonner';

export function useRenameFile() {
	const {
		reloadRootEntries,
		setFocusedItem,
		setSelectedItems,
	} = useEditorView();

	const instanceParams = useInstanceClientIdParams();

	return useCallback(async (data: FileEntry | DirectoryEntry | null, name: string) => {
		if (data && data?.name !== name) {
			const oldFile = data.path.split('/').slice(1).join('/');
			const newFile = data.path.split('/').slice(1, -1).join('/') + '/' + name;

			const toastId = toast.loading('Renaming', {
				description: 'Loading existing contents...',
				duration: 0,
			});
			const fileContents = await getComponentFile({
				...instanceParams,
				file: oldFile,
				project: data.project,
			});

			toast.loading('Renaming', {
				id: toastId,
				description: 'Copying to new name...',
				duration: 0,
			});
			await setComponentFile({
				...instanceParams,
				file: newFile,
				project: data.project,
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
				project: data.project,
			});
			toast.success('Renamed!', {
				id: toastId,
				description: 'All done!',
				duration: 3000,
			});

			reloadRootEntries();

			const existingIndex = `${data.project}/${data.path}`;
			const newIndex = `${existingIndex.split('/').slice(0, -1).join('/')}/${name}`;

			setSelectedItems(selectedItems => {
				const selectedIndex = selectedItems.indexOf(existingIndex);
				if (selectedIndex >= 0) {
					return [
						...selectedItems.slice(0, selectedIndex),
						...selectedItems.slice(selectedIndex + 1),
						newIndex,
					];
				}
				return selectedItems;
			});

			setFocusedItem(focusedItem => {
				if (focusedItem === existingIndex) {
					return newIndex;
				}
				return focusedItem;
			});
		}

	}, [instanceParams, reloadRootEntries, setFocusedItem, setSelectedItems]);
}
