import { useState } from 'react';
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
import { ArrowLeft, ArrowRight, Edit, Trash, TriangleAlert } from 'lucide-react';
import { useDeleteInstance } from '../hooks/useDeleteInstance';
import { toast } from 'sonner';
import { queryClient } from '@/react-query/queryClient';
import { queryKeys } from '@/react-query/constants';

function DeleteInstanceContent({
	onInstanceDelete,
	instanceId,
	instanceName,
	setIsDeleteContentDisplayed,
}: {
	onInstanceDelete: () => void;
	instanceId: string;
	instanceName: string;
	setIsDeleteContentDisplayed: (value: boolean) => void;
}) {
	const { mutate: deleteInstance, isPending } = useDeleteInstance();

	const handleDeleteInstance = () => {
		deleteInstance(instanceId, {
			onSuccess: () => {
				onInstanceDelete();
				toast.success('Success', {
					description: `Instance: ${instanceName} successfully deleted.`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			},
			onError: () => {
				toast.error('Error', {
					description: `Failed to delete instance: ${instanceName}.`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
				onInstanceDelete();
			},
		});
	};

	return (
		<div>
			<DialogHeader>
				<DialogTitle>Delete Instance</DialogTitle>
				<DialogDescription>Are you sure you want to delete this instance?</DialogDescription>
			</DialogHeader>
			<div className="p-3 my-5 text-white rounded-md bg-amber-600">
				<p className="flex space-x-1 font-semibold align-baseline">
					<TriangleAlert className="inline-block size-5" /> <span>Warning</span>
				</p>
				<p className="pt-2 text-base">By deleting this instance you will lose the data stored in it permanently.</p>
			</div>
			<DialogFooter>
				<div className="flex justify-center space-x-5">
					<Button className="rounded-full" onClick={() => setIsDeleteContentDisplayed(false)}>
						<ArrowLeft /> Cancel
					</Button>
					<Button variant="destructive" className="rounded-full" disabled={isPending} onClick={handleDeleteInstance}>
						<Trash /> Delete
					</Button>
				</div>
			</DialogFooter>
		</div>
	);
}

function UpdateInstanceContent({
	setIsDeleteContentDisplayed,
}: {
	setIsDeleteContentDisplayed: (value: boolean) => void;
}) {
	return (
		<div>
			<DialogHeader>
				<DialogTitle>Edit Instance</DialogTitle>
				<DialogDescription>Update instance details here.</DialogDescription>
			</DialogHeader>
			<form className="grid gap-6 text-white">
				<p>Figure out what can be edited for the instance</p>
				<DialogFooter>
					<div className="flex space-x-5">
						<Button
							type="button"
							variant="destructive"
							className="rounded-full"
							onClick={() => setIsDeleteContentDisplayed(true)}
						>
							<Trash /> Delete
						</Button>
						<Button type="submit" variant="submit" className="rounded-full">
							Update <ArrowRight />
						</Button>
					</div>
				</DialogFooter>
			</form>
		</div>
	);
}

function EditInstanceModal({ instanceId, instanceName }: { instanceId: string; instanceName: string }) {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isDeleteContentDisplayed, setIsDeleteContentDisplayed] = useState(false);

	function onInstanceDelete() {
		setIsModalOpen(false);
		setIsDeleteContentDisplayed(false);
		queryClient.invalidateQueries({ queryKey: [queryKeys.cluster] });
	}

	return (
		<Dialog
			open={isModalOpen}
			onOpenChange={() => {
				setIsModalOpen(!isModalOpen);
				// Funky way to prevent the update instance form transition to happen when the modal is closed
				setTimeout(() => {
					setIsDeleteContentDisplayed(false);
				}, 1000);
			}}
		>
			<DialogTrigger asChild>
				<Button className="rounded-md" aria-label={`Edit Instance ${instanceName}`}>
					<Edit />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				{isDeleteContentDisplayed ? (
					<DeleteInstanceContent
						onInstanceDelete={onInstanceDelete}
						instanceId={instanceId}
						instanceName={instanceName}
						setIsDeleteContentDisplayed={setIsDeleteContentDisplayed}
					/>
				) : (
					<UpdateInstanceContent setIsDeleteContentDisplayed={setIsDeleteContentDisplayed} />
				)}
			</DialogContent>
		</Dialog>
	);
}

export default EditInstanceModal;
