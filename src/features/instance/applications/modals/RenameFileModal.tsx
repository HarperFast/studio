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
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useRenameFiles } from '@/features/instance/applications/hooks/useRenameFiles';
import { useSetWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ban, PencilIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import z from 'zod';

export function RenameFileModal() {
	const isModalOpen = useWatchedValue('ShowRenameFileModal', false);
	const hideModal = useSetWatchedValue('ShowRenameFileModal', false);

	const { openedEntry } = useEditorView();
	const RenameFileSchema = z.object({
		name: z
			.string()
			.nonempty({ error: 'Please enter a valid name.' })
			.regex(/^[a-zA-Z0-9_\- .]*$/, {
				error: 'Names can only contain letters, numbers, underscores, hyphens, periods, and spaces.',
			})
			.max(50, { error: 'Names cannot be longer than 50 characters.' })
			.trim()
			.refine((name) => name !== openedEntry?.name, {
				error: 'Please enter a new name.',
				path: ['name'],
			}),
	});
	const [isPending, setIsPending] = useState(false);
	const renameFile = useRenameFiles();

	const form = useForm({
		resolver: zodResolver(RenameFileSchema),
	});

	useEffect(() => {
		if (openedEntry?.name) {
			form.reset({ name: openedEntry?.name });
		}
	}, [openedEntry?.name]);

	const submitForm = useCallback(async (data: z.infer<typeof RenameFileSchema>) => {
		if (!openedEntry) {
			return;
		}

		setIsPending(true);
		await renameFile(openedEntry, data.name);
		hideModal();
		form.reset();
		setIsPending(false);
	}, [setIsPending, openedEntry]);

	const onCancelClick = useCallback(() => {
		hideModal();
		form.reset();
	}, [hideModal, form]);

	return (
		<Dialog onOpenChange={hideModal} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-white">
				<Form {...form}>
					<form onSubmit={form.handleSubmit(submitForm)}>
						<DialogHeader>
							<DialogTitle>Rename File</DialogTitle>
							<DialogDescription>
								{openedEntry?.path}
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
									disabled={isPending || !form.formState.isDirty || !form.formState.isValid}
								>
									<PencilIcon /> Rename
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
