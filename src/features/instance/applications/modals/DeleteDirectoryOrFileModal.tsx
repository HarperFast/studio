import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { dropComponent } from '@/integrations/api/instance/applications/dropComponent';
import { attemptToRestoreFocus } from '@/lib/attemptToRestoreFocus';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { pluralize } from '@/lib/pluralize';
import { Trash } from 'lucide-react';
import { MouseEvent, useCallback } from 'react';
import { toast } from 'sonner';

export function DeleteDirectoryOrFileModal() {
	const { value: isModalOpen, trigger } = useWatchedValue('ShowDeleteDirectoryOrFileModal', false);

	const instanceParams = useInstanceClientIdParams();
	const { openedEntry, reloadRootEntries, setFocusedItem, setSelectedItems, selectedItems } = useEditorView();

	const multipleSelected = selectedItems.length > 1;
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

	const closeModal = useCallback(() => {
		setWatchedValue('ShowDeleteDirectoryOrFileModal', false);
		attemptToRestoreFocus(trigger);
	}, [trigger]);

	const handleDeleteFolderOrFile = useCallback(async () => {
		closeModal();

		let split: string[] = [];
		let count = 0;
		let canceled = false;

		const toastCancelAction = {
			label: 'Cancel',
			onClick: () => {
				canceled = true;
			},
		};
		const toastOKAction = {
			label: 'OK',
			onClick: () => undefined,
		};

		const id = 'deleting-files';

		for (const selectedItem of selectedItems.reverse()) {
			split = (selectedItem as string).split('/');
			const project = split[0];
			const file = split.length > 1 ? split.slice(1).join('/') : undefined;

			toast.loading(`${action} in progress...`, {
				id,
				description: `${count} of ${pluralize(selectedItems.length, 'item', 'items')}`,
				action: toastCancelAction,
			});
			await dropComponent({
				file,
				project,
				...instanceParams,
			});
			if (canceled) {
				break;
			}
			count += 1;
		}

		if (canceled) {
			toast.warning(`${action} canceled!`, { id, description: '', action: toastOKAction });
		} else {
			toast.success(`${action} completed!`, { id, description: '', action: toastOKAction });
		}

		if (split.length) {
			const itemToFocus = split.slice(0, -1).join('/');
			setFocusedItem(itemToFocus || undefined);
			setSelectedItems(itemToFocus ? [itemToFocus] : []);
			void reloadRootEntries();
		}
	}, [action, closeModal, instanceParams, reloadRootEntries, selectedItems, setFocusedItem, setSelectedItems]);

	const onClickYes = useCallback((e: MouseEvent) => {
		e.preventDefault();
		void handleDeleteFolderOrFile();
	}, [handleDeleteFolderOrFile]);

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-white">
				<DialogHeader>
					<DialogTitle>{action} {thing}</DialogTitle>
					<DialogDescription>
						Are you sure you want to {action.toLowerCase()}{' '}
						{multipleSelected ? `these ${selectedItems.length} items` : `this ${thing.toLowerCase()}`}?
					</DialogDescription>
					{!isPackageSelected
						&& (
							<DialogDescription className="whitespace-pre">
								{multipleSelected ? selectedItems.join('\n') : openedEntry?.path}
							</DialogDescription>
						)}
				</DialogHeader>

				<div className="flex w-full gap-4">
					<Button variant="ghostOutline" className="w-full rounded-full" onClick={closeModal}>
						Cancel
					</Button>
					<Button
						variant="destructiveOutline"
						type="button"
						className="w-full rounded-full"
						autoFocus={true}
						onClick={onClickYes}
					>
						<Trash /> {action} {multipleSelected ? 'items' : thing}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
