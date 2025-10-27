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
import { useSetComponentFile } from '@/features/instance/operations/mutations/setComponentFile';
import { useSetWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ban, Plus } from 'lucide-react';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import z from 'zod';

export function AddDirectoryOrFileModal() {
	const type = useWatchedValue('ShowAddDirectoryOrFileModalType', false);
	const hideModal = useSetWatchedValue('ShowAddDirectoryOrFileModalType', false);

	const { openedEntry, reloadRootEntries, setFocusedItem, setSelectedItems, setExpandedItems } = useEditorView();
	const instanceParams = useInstanceClientIdParams();
	const { mutate: addFolderFile, isPending } = useSetComponentFile();
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
		const filePath = (
			isDirectory(openedEntry)
				? splitPath.slice(1)
				: splitPath.slice(1, -1)
		).join('/');
		addFolderFile(
			{
				file: `${filePath}/${data.name}`,
				project: openedEntry.project,
				payload: type === 'directory' ? undefined : '',
				...instanceParams,
			},
			{
				onSuccess: () => {
					void reloadRootEntries();
					hideModal();
					form.reset();
					const treeId = [openedEntry.project, filePath, data.name].filter(excludeFalsy).join('/');
					setFocusedItem(treeId);
					setSelectedItems([treeId]);
					if (type === 'directory') {
						setExpandedItems(expandedItems => [...expandedItems, treeId]);
					}
				},
			},
		);
	}, [addFolderFile, form, hideModal, instanceParams, openedEntry, reloadRootEntries, setExpandedItems, setFocusedItem, setSelectedItems, type]);

	const onCancelClick = useCallback(() => {
		hideModal();
		form.reset();
	}, [hideModal, form]);

	return (
		<Dialog onOpenChange={hideModal} open={!!type}>
			<DialogContent aria-describedby={undefined} className="text-white">
				<Form {...form}>
					<form onSubmit={form.handleSubmit(submitForm)}>
						<DialogHeader>
							<DialogTitle>Add {type}</DialogTitle>
							<DialogDescription>
								Enter the name of the {type} you want to add:
							</DialogDescription>
						</DialogHeader>

						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem className="my-2">
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input
											disabled={isPending}
											type="text"
											autoComplete="off"
											autoCapitalize="off"
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
									<Plus /> Add {type}
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
