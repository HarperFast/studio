import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { ArrowLeft, Trash, TriangleAlert } from 'lucide-react';
import { ReactNode } from 'react';

export function ConfirmDeletionModal({
	typeOfThingBeingDeleted,
	nameOfThingBeingDeleted,
	isModalOpen,
	hideDataLossWarning,
	setIsModalOpen,
	deletionConfirmed,
	deletionPending,
	trigger,
	presentParticiple = 'Deleting',
	transitiveVerb = 'Delete',
}: {
	typeOfThingBeingDeleted: string;
	nameOfThingBeingDeleted?: string;
	isModalOpen: boolean;
	hideDataLossWarning?: boolean;
	setIsModalOpen: (isOpen: boolean) => void;
	deletionConfirmed: () => void;
	deletionPending: boolean;
	trigger?: ReactNode;
	presentParticiple?: 'Deleting' | 'Terminating' | string;
	transitiveVerb?: 'Delete' | 'Terminate' | string;
}) {
	return (
		<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
			{trigger && (
				<DialogTrigger asChild>
					{trigger}
				</DialogTrigger>
			)}
			<DialogContent className="sm:max-w-[750px]">
				<DialogHeader>
					<DialogTitle>
						Are you sure you want to {transitiveVerb.toLowerCase()} this {typeOfThingBeingDeleted}?
					</DialogTitle>
					<DialogDescription>This action cannot be undone.</DialogDescription>
				</DialogHeader>
				{!hideDataLossWarning && (
					<div className="p-3 my-5 text-white rounded-md bg-amber-600">
						<p className="flex space-x-1 font-semibold align-baseline">
							<TriangleAlert className="inline-block size-5" /> <span>Warning</span>
						</p>
						<p className="pt-2 text-base">
							By {presentParticiple.toLowerCase()} {typeOfThingBeingDeleted}
							<span className="font-semibold">{nameOfThingBeingDeleted}</span>
							you will lose the data stored in it permanently.
						</p>
					</div>
				)}
				<DialogFooter>
					<div className="flex justify-center space-x-5">
						<Button className="rounded-full" onClick={() => setIsModalOpen(false)}>
							<ArrowLeft /> Cancel
						</Button>
						<Button
							variant="destructive"
							className="rounded-full"
							onClick={deletionConfirmed}
							disabled={deletionPending}
						>
							<Trash /> {transitiveVerb}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
