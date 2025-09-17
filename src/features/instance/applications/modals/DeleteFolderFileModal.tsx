import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Ban, Trash } from 'lucide-react';
import { MouseEvent, useCallback } from 'react';

export function DeleteFolderFileModal({
	isModalOpen = false,
	setIsModalOpen,
	isPending,
	isFolderSelected,
	isPackageSelected,
	handleDeleteFolderOrFile,
}: {
	readonly isModalOpen: boolean;
	readonly setIsModalOpen: (value: boolean) => void;
	readonly isPending?: boolean;
	readonly isFolderSelected: boolean;
	readonly isPackageSelected: boolean;
	readonly handleDeleteFolderOrFile: () => void;
}) {
	const thing = isPackageSelected ? 'Package' : isFolderSelected ? 'Folder' : 'File';
	const onClickYes = useCallback((e: MouseEvent) => {
		e.preventDefault();
		handleDeleteFolderOrFile();
	}, [handleDeleteFolderOrFile]);
	const onClickNo = useCallback(() => {
		setIsModalOpen(false);
	}, [setIsModalOpen]);

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-white">
				<DialogHeader>
					<DialogTitle>Delete {thing}</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete this {thing.toLowerCase()}?
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col w-full gap-4">
					<Button
						variant="destructiveOutline"
						type="button"
						className="w-full rounded-full"
						disabled={isPending}
						onClick={onClickYes}
					>
						<Trash /> Delete {thing}
					</Button>
					<Button variant="default" className="w-full rounded-full" onClick={onClickNo}>
						<Ban /> Cancel
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
