import { maxFabricConnectUploadFileSize, maxUploadFileSize } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { useDraggingHook } from '@/features/instance/applications/components/ApplicationsSidebar/useDraggingHook';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { confirmOverwrite } from '@/features/instance/applications/modals/confirmOverwrite';
import { setComponentFile } from '@/integrations/api/instance/applications/setComponentFile';
import { humanFileSize } from '@/lib/humanFileSize';
import { pluralize } from '@/lib/pluralize';
import { readAsDataURL } from '@/lib/storage/readAsDataURL';
import { errorHandler } from '@/react-query/queryClient';
import { useParams } from '@tanstack/react-router';
import { cx } from 'class-variance-authority';
import { useCallback, useState } from 'react';
import { FileRejection, FileWithPath, useDropzone } from 'react-dropzone';
import { toast } from 'sonner';

export function DropTarget() {
	const [uploading, setUploading] = useState('');
	const { clusterId }: { clusterId?: string } = useParams({ strict: false });
	const { openedEntry, restrictPackageModification, reloadRootEntries, entryExists } = useEditorView();
	const canUpload = !!openedEntry && !openedEntry.package && !restrictPackageModification;
	const instanceParams = useInstanceClientIdParams();
	const { dragging: isDraggingAnywhere, dragTarget } = useDraggingHook();
	const dragTargetId = dragTarget?.getAttribute?.('data-rct-item-id');
	const dragTargetDirectory = dragTargetId?.split?.('/')?.pop?.();

	const currentProject = openedEntry?.project;
	let currentPath: string | false = false;
	let currentDirectory: string | undefined = undefined;
	if (openedEntry?.path) {
		const parts = openedEntry.path.split('/');
		const currentPathIsDirectory = isDirectory(openedEntry);
		currentPath = canUpload && ((
			currentPathIsDirectory
				? parts.slice(1)
				: parts.slice(1, -1)
		).join('/'));
		currentDirectory = parts[parts.length - (currentPathIsDirectory ? 1 : 2)];
	}

	const onUploadDrop = useCallback(async (
		rawAcceptedFiles: FileWithPath[],
		rawRejectedFiles: FileRejection[],
	) => {
		const dragItemId = dragTarget?.getAttribute?.('data-rct-item-id')?.split?.('/');
		const targetProject = dragItemId?.length ? dragItemId[0] : canUpload ? currentProject : false;
		const targetPath = dragItemId?.length ? dragItemId.slice(1).join('/') : canUpload ? currentPath : false;
		if (targetProject === false || targetProject === undefined || targetPath === false || targetPath === undefined) {
			return;
		}

		const filesToUpload: FileWithPath[] = [];
		const filesRejected: FileRejection[] = rawRejectedFiles.slice();
		// Files whose destination path already exists. Rather than rejecting them outright,
		// collect them and ask once whether to overwrite (uploading a folder over an existing
		// one this way merges it — only the colliding files are replaced).
		const collisions: { file: FileWithPath; path: string }[] = [];

		for (const file of rawAcceptedFiles) {
			const filePath = getFilePath(targetPath, file);
			if (file.name.startsWith('.') || file.relativePath?.includes('/.')) {
				filesRejected.push({
					file,
					errors: [
						{
							message: 'Sensitive files and folders starting with . are skipped.',
							code: 'dot-ignored',
						},
					],
				});
			} else if (entryExists(`${targetProject}/${filePath}`)) {
				collisions.push({ file, path: `${targetProject}/${filePath}` });
			} else {
				filesToUpload.push(file);
			}
		}

		if (collisions.length > 0) {
			const overwrite = await confirmOverwrite({ files: collisions.map(c => c.path), directories: [] });
			for (const collision of collisions) {
				if (overwrite) {
					filesToUpload.push(collision.file);
				} else {
					filesRejected.push({
						file: collision.file,
						errors: [{ message: `${getFilePath(targetPath, collision.file)} already exists`, code: 'duplicate' }],
					});
				}
			}
		}

		let canceled = false;

		const id = 'uploading-files';
		const toastCancelAction = {
			label: 'Cancel',
			onClick: () => {
				canceled = true;
			},
		};
		const toastOKAction = {
			label: 'OK',
			onClick: () => undefined,
		};

		setUploading(`Uploading ${pluralize(filesToUpload.length, 'file', 'files')}...`);

		try {
			const totalBytes = filesToUpload.reduce((sum, f) => sum + f.size, 0);
			let uploadedBytes = 0;
			let counter = 0;
			for (const file of filesToUpload) {
				counter += 1;

				toast.loading(`Upload in progress...`, {
					id,
					descriptionClassName: 'whitespace-pre',
					description: `${counter} of ${pluralize(filesToUpload.length, 'file', 'files')}
${file.name}
${humanFileSize(uploadedBytes)} of ${humanFileSize(totalBytes)}`,
					action: toastCancelAction,
				});

				const filePath = getFilePath(targetPath, file);
				const dataURLResponse = await readAsDataURL(file);
				const dataURLResult = dataURLResponse.target?.result as string | undefined;
				if (!dataURLResult) {
					throw new Error(`Failed to read file: ${file.name}`);
				}
				const demarcation = 'base64,';
				const encodingIndex = dataURLResult.indexOf(demarcation);
				if (encodingIndex === -1) {
					throw new Error(`Invalid data URL format for file: ${file.name}`);
				}
				if (!canceled) {
					await setComponentFile({
						...instanceParams,
						file: filePath,
						project: targetProject,
						encoding: 'base64',
						payload: dataURLResult.slice(encodingIndex + demarcation.length),
					});
					uploadedBytes += file.size;
				} else {
					filesRejected.push({
						file,
						errors: [
							{
								message: `${filePath} cancelled`,
								code: 'cancelled',
							},
						],
					});
				}
			}

			// Always reuse the same toast id so the single upload toast transitions
			// from loading into a terminal state. Using `undefined` here (e.g. when
			// canceled) would spawn a brand-new loading toast that nothing ever
			// replaces or dismisses, leaving "Reloading sidebar..." spinning forever.
			toast.loading(`Reloading sidebar...`, {
				id,
				action: toastOKAction,
				description: '',
			});
			await reloadRootEntries();

			if (filesRejected.length === 0) {
				if (rawAcceptedFiles.length > 0) {
					toast.success(`Uploaded ${pluralize(filesToUpload.length, 'file', 'files')}!`, {
						id,
						action: toastOKAction,
						description: '',
					});
				} else {
					// Nothing was uploaded or rejected — don't leave the loading toast hanging.
					toast.dismiss(id);
				}
			} else {
				// Note: this console.log is deliberate. It lets developers know all the files that were rejected.
				console.log(filesRejected);
				toast.error(canceled ? 'Cancelled uploads' : 'Rejected uploads', {
					id,
					action: toastOKAction,
					descriptionClassName: 'whitespace-pre overflow-y-auto',
					description: filesRejected
						.slice(0, 5)
						.map(r => r.errors.map(e => e.message).join('\n'))
						.join('\n')
						+ (filesRejected?.length > 5 ? '\nCheck the console for the full list.' : ''),
				});
			}
		} catch (error) {
			// An upload (or the reload) threw — e.g. the API rejected an oversized
			// payload ("body size must be less than 2MB"). Without this, the loading
			// toast lingers forever and the user never sees why it failed. Replace it
			// with the real error.
			toast.dismiss(id);
			errorHandler(error);
		} finally {
			setUploading('');
		}
	}, [dragTarget, canUpload, currentProject, currentPath, entryExists, instanceParams, reloadRootEntries]);

	const isFabricConnect = !!clusterId && authStore.checkForFabricConnect(clusterId);
	const { getRootProps, getInputProps } = useDropzone({
		multiple: true,
		maxSize: isFabricConnect ? maxFabricConnectUploadFileSize : maxUploadFileSize,
		onDrop: onUploadDrop,
	});

	if (!canUpload && !dragTarget) {
		if (!isDraggingAnywhere) {
			return null;
		}
		return (
			<div
				className={cx(
					'border-3 border-dashed',
					'pointer-events-auto',
					'cursor-copy text-sm text-center',
					'p-2 w-full fixed bottom-0 h-16',
					'flex flex-col items-center justify-center',
					'bg-red-100 border-red-600 dark:bg-red-950 dark:border-red-600',
				)}
			>
				You cannot upload into<br />
				<strong>{currentDirectory}</strong>
			</div>
		);
	}

	return (
		<div
			{...getRootProps()}
			className={isDraggingAnywhere
				? 'fixed top-0 bottom-0 w-full'
					+ ' pointer-events-none'
				: ''}
		>
			<input id="dropTarget" {...getInputProps()} />
			<div
				className={cx(
					'border-3 border-dashed',
					'pointer-events-auto',
					'cursor-copy text-sm text-center',
					'p-2 w-full fixed bottom-0 h-16',
					'flex flex-col items-center justify-center',
					isDraggingAnywhere
						? 'animate-glow-pulse bg-green-100 border-green-600 dark:bg-green-950 dark:border-green-600'
						: 'border-purple-600 backdrop-blur-sm bg-purple-600/10 dark:bg-purple-600/30',
				)}
			>
				{uploading
					? uploading
					: dragTarget
					? (
						<>
							Drop to upload into<br />
							<strong>{dragTargetDirectory}</strong>
						</>
					)
					: isDraggingAnywhere
					? (
						<>
							Drop to upload into<br />
							<strong>{currentDirectory}</strong>
						</>
					)
					: (
						<>
							Drag and drop to upload<br />or click to select files.
						</>
					)}
			</div>
		</div>
	);
}

function getFilePath(intoPath: string, file: FileWithPath): string {
	const relativePath = file.relativePath ?? file.name;
	const firstSlashIndex = relativePath.indexOf('/');
	const trimmedRelativePath = firstSlashIndex === 0 || firstSlashIndex === 1
		? relativePath.slice(firstSlashIndex + 1)
		: relativePath;
	return intoPath ? `${intoPath}/${trimmedRelativePath}` : trimmedRelativePath;
}
