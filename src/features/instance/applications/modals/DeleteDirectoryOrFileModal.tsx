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
	const action = isPackageSelected ? 'Remove' : 'Delete';
	const thing = isPackageSelected ? 'Imported Application' : isDirectorySelected ? 'Directory' : 'File';
	const { mutate: deleteFolderFile, isPending, isSuccess } = useDropComponent();
	const actionStatus = isSuccess ? `${action}d` : isPending ? `${action.slice(0, -1)}ing` : action;

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
					void reloadRootEntries();
				},
			},
		);
	}, [deleteFolderFile, instanceParams, openedEntry, reloadRootEntries, setFocusedItem, setSelectedItems]);

	const onClickYes = useCallback((e: MouseEvent) => {
		e.preventDefault();
		handleDeleteFolderOrFile();
	}, [handleDeleteFolderOrFile]);

	const closeModal = useSetWatchedValue('ShowDeleteDirectoryOrFileModal', false);

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-white">
				<DialogHeader>
					<DialogTitle>{action} {thing}</DialogTitle>
					<DialogDescription>
						Are you sure you want to {action.toLowerCase()} this {thing.toLowerCase()}?
					</DialogDescription>
					{!isPackageSelected && <DialogDescription>
						{openedEntry?.path}
					</DialogDescription>}
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
						<Trash /> {actionStatus} {thing}{isPending ? '...' : ''}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
