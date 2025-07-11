import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ban, Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import z from 'zod';

export function AddFolderFileModal({
	isModalOpen = false,
	setIsModalOpen,
	isPending,
	isAddingFolder,
	handleAddFolderOrFile,
}: {
	isModalOpen?: boolean;
	setIsModalOpen: (value: boolean) => void;
	isPending?: boolean;
	isAddingFolder?: boolean;
	handleAddFolderOrFile?: (name: string) => void;
}) {
	const NewFileFolderSchema = z.object({
		file: z
			.string({
				message: 'Please enter a valid file name',
			})
			.min(1, { message: 'Must be at least 1 character long' })
			.regex(/^[a-zA-Z0-9_\- .]+$/, {
				message: 'File name can only contain letters, numbers, underscores, hyphens, periods, and spaces',
			})
			.max(50, { message: 'Must be less than 50 characters' })
			.trim(),
	});

	const form = useForm<z.infer<typeof NewFileFolderSchema>>({
		resolver: zodResolver(NewFileFolderSchema),
		defaultValues: {
			file: '',
		},
	});

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-white">
				<Form {...form}>
					<form>
						<DialogHeader>
							<DialogTitle>Add {isAddingFolder ? 'Folder' : 'File'}</DialogTitle>
							<DialogDescription>
								Enter the name of the {isAddingFolder ? 'folder' : 'file'} you want to add:
							</DialogDescription>
						</DialogHeader>

						<FormField
							control={form.control}
							name="file"
							render={({ field }) => (
								<FormItem className="my-2">
									<FormLabel>{isAddingFolder ? 'Folder' : 'File'} Name</FormLabel>
									<FormControl>
										<Input
											disabled={isPending}
											type="text"
											placeholder={`${isAddingFolder ? 'New Folder' : 'New File'}`}
											className=""
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<div className="flex justify-between w-full">
								<Button variant="destructiveOutline" className="rounded-full" onClick={() => setIsModalOpen(false)}>
									<Ban /> Cancel
								</Button>
								<Button
									variant="positiveOutline"
									type="submit"
									className="rounded-full"
									disabled={isPending}
									onClick={(e) => {
										e.preventDefault();
										form.handleSubmit((data) => {
											handleAddFolderOrFile?.(data.file);
											form.reset();
										})();
									}}
								>
									<Plus /> Add {isAddingFolder ? 'Folder' : 'File'}
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
