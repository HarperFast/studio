import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSetWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { Ban, PlusIcon } from 'lucide-react';

export function AddSchemaModal() {
	const isModalOpen = useWatchedValue('ShowAddSchemaModal', false);


	const closeModal = useSetWatchedValue('ShowAddSchemaModal', false);

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-white">
				<DialogHeader>
					<DialogTitle>Add Schema</DialogTitle>
					<DialogDescription>
						Create schema
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
						autoFocus={true}
					>
						<PlusIcon /> Add Schema
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
