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
import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useRenameFiles } from '@/features/instance/applications/hooks/useRenameFiles';
import { dropComponent } from '@/integrations/api/instance/applications/dropComponent';
import { setComponentFile } from '@/integrations/api/instance/applications/setComponentFile';
import { attemptToRestoreFocus } from '@/lib/attemptToRestoreFocus';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { renameFileInPath } from '@/lib/string/paths/renameFileInPath';
import { zodResolver } from '@hookform/resolvers/zod';
import { PencilIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod';
import { confirmOverwrite } from './confirmOverwrite';

/** Every file at or beneath an entry (directories are implicit in file paths). */
function collectFiles(entry: DirectoryEntry | FileEntry): FileEntry[] {
	return isDirectory(entry) ? entry.entries.flatMap(collectFiles) : [entry];
}

export function RenameFileModal() {
	const { value: isModalOpen, trigger } = useWatchedValue('ShowRenameFileModal', false);

	const closeModal = useCallback(() => {
		setWatchedValue('ShowRenameFileModal', false);
		attemptToRestoreFocus(trigger);
	}, [trigger]);

	const { openedEntry, entryExists, reloadRootEntries } = useEditorView();
	const instanceParams = useInstanceClientIdParams();
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
		// A directory can't be moved in a single file operation, so rebase every file
		// beneath it onto the new path — the API recreates the directories implicitly.
		const isDir = isDirectory(openedEntry);
		// A name collision is no longer a hard error: let the user confirm overwriting the
		// existing file (or merging into the existing directory) instead.
		if (entryExists(to)) {
			const confirmed = await confirmOverwrite({
				files: isDir ? [] : [to],
				directories: isDir ? [to] : [],
			});
			if (!confirmed) {
				return;
			}
		}

		const changes = isDir
			? collectFiles(openedEntry).map(file => ({
				from: file.path,
				to: to + file.path.slice(openedEntry.path.length),
			}))
			: [{ from: openedEntry.path, to }];

		setIsPending(true);
		const renamed = await renameFiles(changes);

		// Moving the files leaves the original (now-empty) directory behind, so once
		// the move fully succeeds recreate the renamed shell (for empty folders) and
		// drop the old one. `relative` strips the leading project segment.
		if (renamed && isDir) {
			const relative = (path: string) => path.split('/').slice(1).join('/');
			try {
				if (changes.length === 0) {
					await setComponentFile({
						...instanceParams,
						project: openedEntry.project,
						file: relative(to),
						payload: undefined,
					});
				}
				await dropComponent({ ...instanceParams, project: openedEntry.project, file: relative(openedEntry.path) });
				await reloadRootEntries();
			} catch (error) {
				toast.error('Rename Failed', {
					description: error instanceof Error ? error.message : 'Could not remove the original directory.',
				});
				setIsPending(false);
				return;
			}
		}

		setIsPending(false);
		if (renamed) {
			closeModal();
			form.reset();
			// Restore focus: a renamed directory stays in the tree; a renamed file is back in the editor.
			setWatchedValue(isDir ? 'FocusFileTree' : 'FocusEditor', true);
		}
	}, [closeModal, entryExists, form, instanceParams, openedEntry, reloadRootEntries, renameFiles, setIsPending]);

	const onCancelClick = useCallback(() => {
		closeModal();
		form.reset();
	}, [closeModal, form]);

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent
				aria-describedby={undefined}
				className="text-popover-foreground"
				// The bare `autoFocus` attribute loses a focus race here: the context menu
				// is closing as this dialog opens, and its focus teardown lands on <body>
				// after the input would have been focused. Drive focus explicitly on open
				// (deferred a frame so it wins), selecting the pre-filled name to retype.
				onOpenAutoFocus={event => {
					event.preventDefault();
					requestAnimationFrame(() => form.setFocus('name', { shouldSelect: true }));
				}}
			>
				<Form {...form}>
					<form
						id="instance-rename-app-file-form"
						name="instance-rename-app-file-form"
						onSubmit={form.handleSubmit(submitForm)}
					>
						<DialogHeader>
							<DialogTitle>Rename {isDirectory(openedEntry) ? 'Directory' : 'File'}</DialogTitle>
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
