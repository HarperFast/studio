import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Ban, Plus } from 'lucide-react';

export function AddFolderFileModal({
	isModalOpen = false,
	setIsModalOpen,
	isPending,
}: {
	isModalOpen?: boolean;
	setIsModalOpen: (value: boolean) => void;
	isPending?: boolean;
}) {
	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-white">
				<DialogHeader>
					<DialogTitle>Add Folder/File</DialogTitle>
					<DialogDescription>Enter the name of the folder/file you want to add:</DialogDescription>
				</DialogHeader>

				<Input placeholder="Folder/File Name" />

				<DialogFooter>
					<div className="flex justify-between w-full">
						<Button variant="destructiveOutline" className="rounded-full" onClick={() => setIsModalOpen(false)}>
							<Ban /> Cancel
						</Button>
						<Button variant="positiveOutline" className="rounded-full" disabled={isPending}>
							<Plus /> Add
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
