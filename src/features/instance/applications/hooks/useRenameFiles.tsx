import { ProgressBar } from '@/components/ProgressBar';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import {
	copyEditorFileContent,
	discardEditorFileContent,
	editorFileContentKey,
	readEditorFileContent,
} from '@/features/instance/applications/context/editorFileContent';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import {
	forgetDeletedPath,
	forgetReplacedPath,
	moveEditedPath,
} from '@/features/instance/applications/lib/editorPathState';
import { dropComponent } from '@/integrations/api/instance/applications/dropComponent';
import { getComponentFile } from '@/integrations/api/instance/applications/getComponentFile';
import { setComponentFile } from '@/integrations/api/instance/applications/setComponentFile';
import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';
import { pluralize } from '@/lib/pluralize';
import { describeError } from '@/react-query/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { ExternalToast, toast } from 'sonner';

export function useRenameFiles() {
	const {
		reloadRootEntries,
		setFocusedItem,
		setSelectedItems,
	} = useEditorView();

	const instanceParams = useInstanceClientIdParams();
	const queryClient = useQueryClient();

	return useCallback(async (changes: { from: string; to: string }[]): Promise<boolean> => {
		let canceled = false;
		const actualChanges = changes.filter(change => change.from !== change.to);

		if (actualChanges.length === 0) {
			return true;
		}

		const toastTitle = `Renaming ${pluralize(actualChanges.length, 'File', 'Files')}`;
		const toastConfig: ExternalToast = {
			duration: 60_000,
			action: {
				label: 'Cancel',
				onClick: () => {
					canceled = true;
				},
			},
		};

		toastConfig.id = toast.loading(toastTitle, {
			...toastConfig,
			description: <ProgressBar animated={true} width="0%" />,
		});

		const stepsPerFile = 3;
		const totalSteps = actualChanges.length * stepsPerFile;
		let currentStep = 0;

		function stepForward() {
			currentStep += 1;
			toast.loading(toastTitle, {
				...toastConfig,
				description: (
					<ProgressBar animated={true} width={(currentStep === 0 ? 0 : (currentStep / totalSteps * 100)) + '%'} />
				),
			});
		}

		try {
			for (const change of actualChanges) {
				const oldParts = change.from.split('/');
				const oldProject = oldParts.shift()!;
				const oldFile = oldParts.join('/');
				const newParts = change.to.split('/');
				const newProject = newParts.shift()!;
				const newFile = newParts.join('/');

				const fileContents = await getComponentFile({
					...instanceParams,
					file: oldFile,
					project: oldProject,
					encoding: 'base64',
				});
				if (canceled) {
					break;
				}
				stepForward();

				await setComponentFile({
					...instanceParams,
					file: newFile,
					project: newProject,
					encoding: 'base64',
					payload: fileContents.message,
				});
				forgetReplacedPath(queryClient, instanceParams.entityId, change.to);
				if (canceled) {
					break;
				}
				stepForward();

				copyEditorFileContent(instanceParams.entityId, change.from, change.to);
				const destination = editorFileContentKey(instanceParams.entityId, change.to);
				const copied = readEditorFileContent(destination);
				// Edits typed into the destination while the drop was in flight are newer than the copy.
				try {
					await dropComponent({
						...instanceParams,
						file: oldFile,
						project: oldProject,
					});
				} catch (error) {
					if (!isUnansweredWrite(error) && readEditorFileContent(destination) === copied) {
						discardEditorFileContent(instanceParams.entityId, change.to);
					}
					throw error;
				}
				if (readEditorFileContent(destination) === copied) {
					moveEditedPath(queryClient, instanceParams.entityId, change.from, change.to);
				} else {
					forgetDeletedPath(queryClient, instanceParams.entityId, change.from);
				}
				if (canceled) {
					break;
				}
				stepForward();
			}
		} catch (error) {
			const { title, description } = isUnansweredWrite(error) ? describeError(error) : {
				title: 'Rename Failed',
				description: error instanceof Error ? error.message : 'An unexpected error occurred while renaming.',
			};
			toast.error(title, {
				id: toastConfig.id,
				description,
				duration: 10000,
				action: { label: 'OK', onClick: () => undefined },
			});
			void reloadRootEntries();
			return false;
		}

		if (currentStep >= totalSteps) {
			toast.success(`Renamed ${pluralize(actualChanges.length, 'File', 'Files')}`, {
				id: toastConfig.id,
				description: 'All done!',
				duration: 3000,
				action: {
					label: 'OK',
					onClick: () => {
						// ;D
					},
				},
			});
		} else {
			toast.warning(`Rename Cancelled`, {
				id: toastConfig.id,
				description: `${currentStep} of ${totalSteps} steps completed.`,
				duration: 10000,
				action: {
					label: 'OK',
					onClick: () => {
						// >_<
					},
				},
			});
		}

		void reloadRootEntries();

		setSelectedItems(selectedItems => {
			const updatedSelectedItems = selectedItems.slice();
			for (const change of actualChanges) {
				const existingIndex = updatedSelectedItems.indexOf(change.from);
				if (existingIndex >= 0) {
					updatedSelectedItems.splice(existingIndex, 1, change.to);
				} else {
					updatedSelectedItems.push(change.to);
				}
			}
			return updatedSelectedItems;
		});

		setFocusedItem(focusedItem => {
			for (const change of actualChanges) {
				if (focusedItem === change.from) {
					return change.to;
				}
			}
			return focusedItem;
		});

		// false when the user cancelled partway, so callers don't treat a partial
		// move as a completed rename.
		return currentStep >= totalSteps;
	}, [instanceParams, queryClient, reloadRootEntries, setFocusedItem, setSelectedItems]);
}
