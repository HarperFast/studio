import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useDropComponent } from '@/features/instance/operations/mutations/dropComponent';
import { setWatchedValue, useSetWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { Ban, Trash } from 'lucide-react';
import { MouseEvent, useCallback } from 'react';

export function DeleteDirectoryOrFileModal() {
	const isModalOpen = useWatchedValue('ShowDeleteDirectoryOrFileModal', false);

	const instanceParams = useInstanceClientIdParams();
	const { openedEntry, reloadRootEntries, setFocusedItem, setSelectedItems } = useEditorView();
	const isDirectorySelected = isDirectory(openedEntry);
	const isPackageSelected = !!openedEntry?.package;
	const thing = isPackageSelected ? 'Package' : isDirectorySelected ? 'Directory' : 'File';
	const { mutate: deleteFolderFile, isPending, isSuccess } = useDropComponent();

	const handleDeleteFolderOrFile = useCallback(() => {
		if (!openedEntry) {
			return;
		}
		deleteFolderFile(
			{
				file: openedEntry.package
					? undefined
					: `${openedEntry.path.split('/').slice(1).join('/')}`,
				project: openedEntry.project,
				...instanceParams,
			},
			{
				onSuccess: () => {
					setWatchedValue('ShowDeleteDirectoryOrFileModal', false);
					const itemToFocus = !openedEntry.package && openedEntry.path.split('/').slice(0, -1).join('/');
					setFocusedItem(itemToFocus || undefined);
					setSelectedItems(itemToFocus ? [itemToFocus] : []);
					reloadRootEntries();
				},
			},
		);
	}, [deleteFolderFile, instanceParams, openedEntry]);

	const onClickYes = useCallback((e: MouseEvent) => {
		e.preventDefault();
		handleDeleteFolderOrFile();
	}, [handleDeleteFolderOrFile]);

	const closeModal = useSetWatchedValue('ShowDeleteDirectoryOrFileModal', false);

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-white">
				<DialogHeader>
					<DialogTitle>Delete {thing}</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete this {thing.toLowerCase()}?
					</DialogDescription>
					<DialogDescription>
						{openedEntry?.path}
					</DialogDescription>
				</DialogHeader>

				<div className="flex w-full gap-4">
					<Button variant="ghostOutline" className="w-full rounded-full" onClick={closeModal}>
						<Ban /> Cancel
					</Button>
					<Button
						variant="destructiveOutline"
						type="button"
						className="w-full rounded-full"
						disabled={isPending}
						autoFocus={true}
						onClick={onClickYes}
					>
						<Trash /> {isSuccess ? 'Deleted' : isPending ? 'Deleting' : 'Delete'} {thing}{isPending ? '...' : ''}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
