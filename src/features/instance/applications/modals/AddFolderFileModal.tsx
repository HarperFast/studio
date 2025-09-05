import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
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
	readonly isModalOpen?: boolean;
	readonly setIsModalOpen: (value: boolean) => void;
	readonly isPending?: boolean;
	readonly isAddingFolder?: boolean;
	readonly handleAddFolderOrFile?: (name: string) => void;
}) {
	const NewFileFolderSchema = z.object({
		name: z
			.string({
				message: 'Please enter a valid name',
			})
			.min(1, { message: 'Must be at least 1 character long' })
			.regex(/^[a-zA-Z0-9_\- .]+$/, {
				message: 'Names can only contain letters, numbers, underscores, hyphens, periods, and spaces',
			})
			.max(50, { message: 'Must be less than 50 characters' })
			.trim(),
	});

	const form = useForm({
		resolver: zodResolver(NewFileFolderSchema),
		defaultValues: {
			name: '',
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
							name="name"
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
								<Button type="button" variant="destructiveOutline" className="rounded-full" onClick={() => setIsModalOpen(false)}>
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
											handleAddFolderOrFile?.(data.name);
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
