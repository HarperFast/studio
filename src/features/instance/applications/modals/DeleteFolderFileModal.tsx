import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Ban, Trash } from 'lucide-react';

export function DeleteFolderFileModal({
	isModalOpen = false,
	setIsModalOpen,
	isPending,
	isFolderSelected,
	handleDeleteFolderOrFile,
}: {
	readonly isModalOpen: boolean;
	readonly setIsModalOpen: (value: boolean) => void;
	readonly isPending?: boolean;
	readonly isFolderSelected: boolean;
	readonly handleDeleteFolderOrFile: () => void;
}) {
	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-white">
				<DialogHeader>
					<DialogTitle>Delete {isFolderSelected ? 'Folder' : 'File'}</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete this {isFolderSelected ? 'folder' : 'file'}?
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col w-full gap-4">
					<Button
						variant="destructiveOutline"
						type="button"
						className="w-full rounded-full"
						disabled={isPending}
						onClick={(e) => {
							e.preventDefault();
							handleDeleteFolderOrFile();
						}}
					>
						<Trash /> Delete {isFolderSelected ? 'Folder' : 'File'}
					</Button>
					<Button variant="default" className="w-full rounded-full" onClick={() => setIsModalOpen(false)}>
						<Ban /> Cancel
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
