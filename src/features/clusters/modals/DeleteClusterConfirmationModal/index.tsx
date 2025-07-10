import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, Trash, TriangleAlert } from 'lucide-react';

export function DeleteClusterConfirmationModal({
	clusterInfo,
	isModalOpen,
	isDeletingClusterPending,
	handleDeleteCluster,
	setIsModalOpen,
}: {
	clusterInfo: { id: string; name: string };
	isModalOpen: boolean;
	isDeletingClusterPending: boolean;
	handleDeleteCluster: () => void;
	setIsModalOpen: (isOpen: boolean) => void;
}) {
	return (
		<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
			<DialogContent className="sm:max-w-[750px]">
				<DialogHeader>
					<DialogTitle>Are you sure you want to delete this cluster?</DialogTitle>
					<DialogDescription>This action cannot be undone.</DialogDescription>
				</DialogHeader>
				<div className="p-3 my-5 text-white rounded-md bg-amber-600">
					<p className="flex space-x-1 font-semibold align-baseline">
						<TriangleAlert className="inline-block size-5" /> <span>Warning</span>
					</p>
					<p className="pt-2 text-base">
						By deleting cluster <span className="font-semibold">{clusterInfo.name}</span> you will lose the data stored
						in it permanently.
					</p>
				</div>
				<DialogFooter>
					<div className="flex justify-center space-x-5">
						<Button className="rounded-full" onClick={() => setIsModalOpen(false)}>
							<ArrowLeft /> Cancel
						</Button>
						<Button
							variant="destructive"
							className="rounded-full"
							onClick={handleDeleteCluster}
							disabled={isDeletingClusterPending}
						>
							<Trash /> Delete
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
