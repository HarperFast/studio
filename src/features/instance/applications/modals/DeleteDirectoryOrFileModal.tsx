import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { isProtectedPath } from '@/features/instance/applications/context/isProtectedComponentPackage';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { deleteSelectedItems } from '@/features/instance/applications/lib/deleteSelectedItems';
import { dropComponent } from '@/integrations/api/instance/applications/dropComponent';
import { attemptToRestoreFocus } from '@/lib/attemptToRestoreFocus';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { pluralize } from '@/lib/pluralize';
import { errorHandler } from '@/react-query/queryClient';
import { Trash } from 'lucide-react';
import { MouseEvent, useCallback } from 'react';
import { toast } from 'sonner';

export function DeleteDirectoryOrFileModal() {
	const { value: isModalOpen, trigger } = useWatchedValue('ShowDeleteDirectoryOrFileModal', false);

	const instanceParams = useInstanceClientIdParams();
	const { openedEntry, reloadRootEntries, rootEntries, setFocusedItem, setSelectedItems, selectedItems } =
		useEditorView();

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

		// Reached by a global Cmd+Delete shortcut that checks no capability, and deletes the whole
		// selection rather than the entry the flags were computed for — so refuse here, at the mutation.
		const protectedSelection = selectedItems.filter(item => isProtectedPath(rootEntries, String(item)));
		if (protectedSelection.length) {
			toast.error(`${action} refused`, {
				description: `${protectedSelection.join(', ')} is managed by Harper and keeps this instance in the `
					+ 'load balancer. Remove it from the selection to continue.',
			});
			return;
		}

		let canceled = false;
		const id = 'deleting-files';
		const total = pluralize(selectedItems.length, 'item', 'items');
		const toastOKAction = {
			label: 'OK',
			onClick: () => undefined,
		};

		// Delete bottom-up so removing a child doesn't shift the path of a parent
		// still queued for deletion. Copy first — `selectedItems` is shared state.
		const result = await deleteSelectedItems(selectedItems.map(String).reverse(), {
			dropItem: (project, file) => dropComponent({ file, project, ...instanceParams }),
			onProgress: (deleted) => {
				toast.loading(`${action} in progress...`, {
					id,
					description: `${deleted} of ${total}`,
					action: {
						label: 'Cancel',
						onClick: () => {
							canceled = true;
						},
					},
				});
			},
			isCanceled: () => canceled,
		});

		if (result.error) {
			// Replace the spinner so it can't hang, then surface the real error.
			toast.dismiss(id);
			errorHandler(result.error);
		} else if (result.canceled) {
			toast.warning(`${action} canceled!`, { id, description: '', action: toastOKAction });
		} else {
			toast.success(`${action} completed!`, { id, description: '', action: toastOKAction });
		}

		if (result.lastSplit.length) {
			const itemToFocus = result.lastSplit.slice(0, -1).join('/');
			setFocusedItem(itemToFocus || undefined);
			setSelectedItems(itemToFocus ? [itemToFocus] : []);
			void reloadRootEntries();
			// Land keyboard focus on the parent directory of what was just deleted.
			setWatchedValue('FocusFileTree', true);
		}
	}, [
		action,
		closeModal,
		instanceParams,
		reloadRootEntries,
		rootEntries,
		selectedItems,
		setFocusedItem,
		setSelectedItems,
	]);

	const onClickYes = useCallback((e: MouseEvent) => {
		e.preventDefault();
		void handleDeleteFolderOrFile();
	}, [handleDeleteFolderOrFile]);

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-popover-foreground">
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
					<Button type="button" variant="ghostOutline" className="w-full" onClick={closeModal}>
						Cancel
					</Button>
					<Button
						variant="destructiveOutline"
						type="button"
						className="w-full"
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
