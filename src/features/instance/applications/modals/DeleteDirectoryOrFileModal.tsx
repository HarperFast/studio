import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useDropComponent } from '@/integrations/api/instance/applications/dropComponent';
import { attemptToRestoreFocus } from '@/lib/attemptToRestoreFocus';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { Trash } from 'lucide-react';
import { MouseEvent, useCallback } from 'react';

export function DeleteDirectoryOrFileModal() {
	const { value: isModalOpen, trigger } = useWatchedValue('ShowDeleteDirectoryOrFileModal', false);

	const instanceParams = useInstanceClientIdParams();
	const { openedEntry, reloadRootEntries, setFocusedItem, setSelectedItems } = useEditorView();
	const isDirectorySelected = isDirectory(openedEntry);
	const isApplicationSelected = isDirectorySelected && openedEntry.path === openedEntry.project;
	const isPackageSelected = !!openedEntry?.package;
	const action = isPackageSelected ? 'Remove' : 'Delete';
	const thing = isPackageSelected
		? 'Imported Application'
		: isApplicationSelected
			? 'Application'
			: isDirectorySelected
				? 'Directory'
				: 'File';
	const { mutate: deleteFolderFile, isPending, isSuccess } = useDropComponent();
	const actionStatus = isSuccess ? `${action}d` : isPending ? `${action.slice(0, -1)}ing` : action;

	const closeModal = useCallback(() => {
		setWatchedValue('ShowDeleteDirectoryOrFileModal', false);
		attemptToRestoreFocus(trigger);
	}, [trigger]);

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
					closeModal();
					const itemToFocus = !openedEntry.package && openedEntry.path.split('/').slice(0, -1).join('/');
					setFocusedItem(itemToFocus || undefined);
					setSelectedItems(itemToFocus ? [itemToFocus] : []);
					void reloadRootEntries();
				},
			},
		);
	}, [deleteFolderFile, instanceParams, openedEntry, reloadRootEntries, setFocusedItem, setSelectedItems, closeModal]);

	const onClickYes = useCallback((e: MouseEvent) => {
		e.preventDefault();
		handleDeleteFolderOrFile();
	}, [handleDeleteFolderOrFile]);

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
						Cancel
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
