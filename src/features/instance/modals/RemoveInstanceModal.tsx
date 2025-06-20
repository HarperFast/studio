import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Ban, Trash, TriangleAlert } from 'lucide-react';

export function RemoveInstanceModal({
	isModalOpen = false,
	setIsModalOpen,
}: {
	isModalOpen?: boolean;
	setIsModalOpen: (value: boolean) => void;
}) {
	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			{/* NOTE - Is this okay to do for the aria describedby? */}
			<DialogContent aria-describedby={undefined} className="text-white">
				<DialogHeader>
					<DialogTitle>Remove Instance</DialogTitle>
					<DialogDescription>Are you sure you want to remove this instance?</DialogDescription>
				</DialogHeader>

				<div className="p-3 my-5 text-white rounded-md bg-amber-600">
					<p className="flex space-x-1 font-semibold align-baseline">
						<TriangleAlert className="inline-block size-5" /> <span className="font-bold">Warning</span>
					</p>
					<ul className="mt-2 list-disc list-inside">
						<li>
							<span className="font-bold">DOES NOT</span> uninstall Harper.
						</li>
						<li>
							<span className="font-bold">DOES</span> leave all your data intact.
						</li>
						<li>
							<span className="font-bold">REMOVES</span> your instance license.
						</li>
						<li>
							<span className="font-bold">STOPS</span> recurring license charges.
						</li>
						<li>
							<span className="font-bold">LIMITS</span> instance to 1GB RAM.
						</li>
						<li>
							<span className="font-bold">REMOVES</span> instance from the Studio.
						</li>
						<li>
							<span className="font-bold">RESTARTS</span> the instance.
						</li>
					</ul>
				</div>

				<DialogFooter>
					<div className="flex justify-between w-full">
						<Button variant="submit" className="rounded-full" onClick={() => setIsModalOpen(false)}>
							<Ban /> Cancel
						</Button>
						<Button variant="destructive" className="rounded-full">
							<Trash /> Remove
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
