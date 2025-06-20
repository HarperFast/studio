import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FileSpreadsheet, UploadCloud } from 'lucide-react';
import { useState } from 'react';

export function UploadCSVModal() {
	const [isModalOpen, setIsModalOpen] = useState(false);
	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			<DialogTrigger asChild>
				<Button className="rounded-full ">
					<FileSpreadsheet /> Upload CSV
				</Button>
			</DialogTrigger>
			{/* NOTE - Is this okay to do for the aria describedby? */}
			<DialogContent aria-describedby={undefined} className="text-white">
				<DialogHeader>
					<DialogTitle>Upload A CSV File</DialogTitle>
				</DialogHeader>
				<Input type="file" accept=".csv" />
				<DialogFooter>
					<Button variant="submit" className="rounded-full">
						<UploadCloud /> Upload CSV
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
