import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Save, Settings, Trash } from 'lucide-react';
import { useState } from 'react';

export function BrowseSettingsModal() {
	const [isModalOpen, setIsModalOpen] = useState(false);
	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			<DialogTrigger asChild>
				<Button
					className="mt-4 bg-linear-(--purple-dark-to-light-gradient) hover:bg-linear-(--purple-gradient) w-full"
					size="lg"
				>
					<Settings /> Settings
				</Button>
			</DialogTrigger>
			{/* NOTE - Is this okay to do for the aria describedby? */}
			<DialogContent aria-describedby={undefined} className="text-popover-foreground">
				<DialogHeader>
					<DialogTitle>Edit Row</DialogTitle>
				</DialogHeader>

				<DialogFooter>
					<div className="flex justify-between w-full">
						<Button type="button" variant="destructive">
							<Trash /> Delete Row
						</Button>
						<Button variant="submit">
							<Save /> Save Changes
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
