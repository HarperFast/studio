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
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { LengthLimitedInput } from '@/components/ui/form/LengthLimitedInput';
import { revealFieldErrorOnEnter } from '@/components/ui/form/revealFieldErrorOnEnter';
import type { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import {
	calculateRootEntries,
} from '@/features/instance/applications/components/ApplicationsSidebar/calculateRootEntries';
import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useEntryActions } from '@/features/instance/applications/hooks/useEntryActions';
import { refuseRenameDuringSave, useRenameFiles } from '@/features/instance/applications/hooks/useRenameFiles';
import { forgetDeletedPath } from '@/features/instance/applications/lib/editorPathState';
import { startRename } from '@/features/instance/applications/lib/editorSaveInterlock';
import { dropComponent } from '@/integrations/api/instance/applications/dropComponent';
import { getComponents } from '@/integrations/api/instance/applications/getComponents';
import { setComponentFile } from '@/integrations/api/instance/applications/setComponentFile';
import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';
import { attemptToRestoreFocus } from '@/lib/attemptToRestoreFocus';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { renameFileInPath } from '@/lib/string/paths/renameFileInPath';
import { describeError } from '@/react-query/queryClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { PencilIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod';
import { confirmOverwrite } from './confirmOverwrite';

/** Every file at or beneath an entry (directories are implicit in file paths). */
function collectFiles(entry: DirectoryEntry | FileEntry): FileEntry[] {
	return isDirectory(entry) ? entry.entries.flatMap(collectFiles) : [entry];
}

function entryAt(entries: Array<DirectoryEntry | FileEntry>, path: string): DirectoryEntry | FileEntry | undefined {
	for (const entry of entries) {
		if (entry.path === path) {
			return entry;
		}
		if (isDirectory(entry) && path.startsWith(`${entry.path}/`)) {
			return entryAt(entry.entries, path);
		}
	}
	return undefined;
}

/** Rejects as soon as `signal` aborts, rather than when `promise` settles. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise((resolve, reject) => {
		const abort = () => reject(signal.reason);
		signal.addEventListener('abort', abort, { once: true });
		void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
	});
}

async function folderMoves(instanceParams: InstanceClientIdConfig, from: string, to: string, signal: AbortSignal) {
	// Only a read, so a closed dialog stops waiting for it and lets the instance go at once.
	const { entries } = await untilAborted(getComponents(instanceParams), signal);
	const folder = entryAt(calculateRootEntries(entries).rootEntries, from);
	if (!folder || !isDirectory(folder)) {
		throw new Error(`${from} is no longer on the instance.`);
	}
	return collectFiles(folder).map(file => ({ from: file.path, to: to + file.path.slice(from.length) }));
}

export function RenameFileModal() {
	const { value: isModalOpen, trigger } = useWatchedValue('ShowRenameFileModal', false);
	const cancelOnClose = useRef<AbortController>(undefined);
	useEffect(() => () => cancelOnClose.current?.abort(), []);

	const closeModal = useCallback(() => {
		cancelOnClose.current?.abort();
		setWatchedValue('ShowRenameFileModal', false);
		attemptToRestoreFocus(trigger);
	}, [trigger]);

	const { openedEntry, entryExists, reloadRootEntries, isSavingAnyFile } = useEditorView();
	const { canRename } = useEntryActions(openedEntry);
	// Shortcuts set the flag without checking; left set, it would open the dialog on a later entry.
	useEffect(() => {
		if (isModalOpen && !canRename) {
			setWatchedValue('ShowRenameFileModal', false);
		}
	}, [isModalOpen, canRename]);
	const instanceParams = useInstanceClientIdParams();
	const queryClient = useQueryClient();
	const RenameFileSchema = z.object({
		name: z
			.string()
			.trim()
			.nonempty({ error: 'Please enter a valid name.' })
			.regex(/^[a-zA-Z0-9_\- .]*$/, {
				error: 'Names can only contain letters, numbers, underscores, hyphens, periods, and spaces.',
			})
			.max(50, { error: 'Names cannot be longer than 50 characters.' })
			.refine((name) => name !== openedEntry?.name, {
				error: 'Please enter a new name.',
			}),
	});
	const [isPending, setIsPending] = useState(false);
	const renameFiles = useRenameFiles();

	const form = useForm({
		resolver: zodResolver(RenameFileSchema),
		mode: 'onTouched',
	});
	const { isDirty, isValid } = form.formState;

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

		// The old folder's drop takes every file under it, so a folder's rename holds the whole instance.
		const cancellation = new AbortController();
		const folderRename = isDir
			? startRename(queryClient, instanceParams.entityId, 'instance', cancellation.signal)
			: undefined;
		if (isDir && !folderRename) {
			refuseRenameDuringSave();
			return;
		}
		const signOutGeneration = authStore.getSignOutGeneration(instanceParams.entityId);
		const givenUp = () =>
			cancellation.signal.aborted || authStore.getSignOutGeneration(instanceParams.entityId) !== signOutGeneration;
		setIsPending(true);
		cancelOnClose.current = cancellation;
		const endFolderRename = await folderRename;
		let renamed: boolean;
		try {
			let changes = [{ from: openedEntry.path, to }];
			if (endFolderRename && !givenUp()) {
				try {
					changes = await folderMoves(instanceParams, openedEntry.path, to, cancellation.signal);
				} catch (error) {
					if (!givenUp()) {
						toast.error('Rename Failed', {
							description: error instanceof Error ? error.message : 'Could not list the folder.',
						});
						setIsPending(false);
						return;
					}
				}
			}
			if (givenUp()) {
				toast.warning('Rename Cancelled', { description: 'Nothing was renamed.', duration: 10000 });
				setIsPending(false);
				return;
			}
			renamed = await renameFiles(changes, { startedByCaller: isDir, signal: cancellation.signal });

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
					forgetDeletedPath(queryClient, instanceParams.entityId, openedEntry.path);
					await reloadRootEntries();
				} catch (error) {
					const { title, description } = isUnansweredWrite(error) ? describeError(error) : {
						title: 'Rename Failed',
						description: error instanceof Error ? error.message : 'Could not remove the original directory.',
					};
					toast.error(title, { description });
					setIsPending(false);
					return;
				}
			}
		} finally {
			cancelOnClose.current = undefined;
			endFolderRename?.();
		}

		setIsPending(false);
		if (renamed) {
			closeModal();
			form.reset();
			// Restore focus: a renamed directory stays in the tree; a renamed file is back in the editor.
			setWatchedValue(isDir ? 'FocusFileTree' : 'FocusEditor', true);
		}
	}, [
		closeModal,
		entryExists,
		form,
		instanceParams,
		openedEntry,
		queryClient,
		reloadRootEntries,
		renameFiles,
		setIsPending,
	]);

	const onCancelClick = useCallback(() => {
		closeModal();
		form.reset();
	}, [closeModal, form]);

	return (
		<Dialog onOpenChange={closeModal} open={!!isModalOpen && canRename}>
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
						onKeyDown={revealFieldErrorOnEnter(form)}
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
									<LengthLimitedInput
										disabled={isPending}
										type="text"
										autoComplete="off"
										autoCapitalize="off"
										maxLength={RenameFileSchema.shape.name.maxLength!}
										{...field}
									/>
									<FormMessage />
								</FormItem>
							)}
						/>
						{isSavingAnyFile && (
							<p className="text-sm text-muted-foreground">Rename once the save in progress finishes.</p>
						)}

						<DialogFooter>
							<div className="flex justify-between w-full">
								<Button type="button" variant="ghostOutline" onClick={onCancelClick}>
									Cancel
								</Button>
								<Button
									variant="positiveOutline"
									type="submit"
									disabled={isPending || isSavingAnyFile || !isDirty || !isValid}
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
