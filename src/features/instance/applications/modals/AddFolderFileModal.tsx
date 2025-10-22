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
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useUpdateComponentFile } from '@/features/instance/operations/mutations/updateComponentFile';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ban, Plus } from 'lucide-react';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import z from 'zod';

export function AddFolderFileModal({
	isModalOpen = false,
	setIsModalOpen,
	isAddingFolder,
}: {
	readonly isModalOpen?: boolean;
	readonly setIsModalOpen: (value: boolean) => void;
	readonly isAddingFolder?: boolean;
}) {
	const { openedEntry, reloadRootEntries } = useEditorView();
	const instanceParams = useInstanceClientIdParams();
	const { mutate: addFolderFile, isPending } = useUpdateComponentFile();
	const NewFileFolderSchema = z.object({
		name: z
			.string()
			.nonempty({ error: 'Please enter a valid name.' })
			.regex(/^[a-zA-Z0-9_\- .]*$/, {
				error: 'Names can only contain letters, numbers, underscores, hyphens, periods, and spaces.',
			})
			.max(50, { error: 'Names cannot be longer than 50 characters.' })
			.trim(),
	});

	const form = useForm({
		resolver: zodResolver(NewFileFolderSchema),
		defaultValues: {
			name: '',
		},
	});

	const submitForm = useCallback((data: z.infer<typeof NewFileFolderSchema>) => {
		if (!openedEntry) {
			return;
		}
		const splitPath = openedEntry.path.split('/');
		const intoPath = (
			isDirectory(openedEntry)
				? splitPath.slice(1)
				: splitPath.slice(1, -1)
		).join('/');
		addFolderFile(
			{
				file: `${intoPath}/${data.name}`,
				project: openedEntry.project,
				payload: isAddingFolder ? undefined : '',
				...instanceParams,
			},
			{
				onSuccess: () => {
					reloadRootEntries();
					setIsModalOpen(false);
					form.reset();
				},
			},
		);
	}, [addFolderFile, instanceParams, isAddingFolder, openedEntry, reloadRootEntries]);

	const onCancelClick = useCallback(() => {
		setIsModalOpen(false);
		form.reset();
	}, [setIsModalOpen, form]);

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-white">
				<Form {...form}>
					<form onSubmit={form.handleSubmit(submitForm)}>
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
								<Button type="button" variant="destructiveOutline" className="rounded-full" onClick={onCancelClick}>
									<Ban /> Cancel
								</Button>
								<Button
									variant="positiveOutline"
									type="submit"
									className="rounded-full"
									disabled={isPending}
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
