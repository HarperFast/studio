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
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useRenameFiles } from '@/features/instance/applications/hooks/useRenameFiles';
import { attemptToRestoreFocus } from '@/lib/attemptToRestoreFocus';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { renameFileInPath } from '@/lib/string/paths/renameFileInPath';
import { zodResolver } from '@hookform/resolvers/zod';
import { PencilIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod';

export function RenameFileModal() {
	const { value: isModalOpen, trigger } = useWatchedValue('ShowRenameFileModal', false);

	const closeModal = useCallback(() => {
		setWatchedValue('ShowRenameFileModal', false);
		attemptToRestoreFocus(trigger);
	}, [trigger]);

	const { openedEntry, entryExists } = useEditorView();
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
			}),
	});
	const [isPending, setIsPending] = useState(false);
	const renameFiles = useRenameFiles();

	const form = useForm({
		resolver: zodResolver(RenameFileSchema),
	});

	useEffect(() => {
		if (openedEntry?.name) {
			form.reset({ name: openedEntry?.name });
		}
	}, [form, openedEntry?.name]);

	const submitForm = useCallback(async (data: z.infer<typeof RenameFileSchema>) => {
		if (!openedEntry) {
			return;
		}
		const to = renameFileInPath(openedEntry.path, data.name);
		if (entryExists(to)) {
			toast.error(`${isDirectory(openedEntry) ? 'Directory' : 'File'} already exists!`, {
				description: to,
			});
			return;
		}

		setIsPending(true);
		await renameFiles([{ from: openedEntry.path, to }]);
		closeModal();
		form.reset();
		setIsPending(false);
	}, [closeModal, entryExists, form, openedEntry, renameFiles, setIsPending]);

	const onCancelClick = useCallback(() => {
		closeModal();
		form.reset();
	}, [closeModal, form]);

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
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
								<Button type="button" variant="ghostOutline" className="rounded-full" onClick={onCancelClick}>
									Cancel
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
