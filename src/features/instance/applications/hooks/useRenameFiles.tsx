import { ProgressBar } from '@/components/ProgressBar';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { dropComponent } from '@/features/instance/operations/mutations/dropComponent';
import { setComponentFile } from '@/features/instance/operations/mutations/setComponentFile';
import { getComponentFile } from '@/features/instance/operations/queries/getComponentFile';
import { pluralize } from '@/lib/pluralize';
import { useCallback } from 'react';
import { ExternalToast, toast } from 'sonner';

export function useRenameFiles() {
	const {
		reloadRootEntries,
		setFocusedItem,
		setSelectedItems,
	} = useEditorView();

	const instanceParams = useInstanceClientIdParams();

	return useCallback(async (changes: { from: string, to: string }[]) => {
		let canceled = false;
		const actualChanges = changes.filter(change => change.from !== change.to);

		if (actualChanges.length === 0) {
			return;
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
				description:
					<ProgressBar animated={true} width={(currentStep === 0 ? 0 : (currentStep / totalSteps * 100)) + '%'} />,
			});
		}


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
			});
			if (canceled) {
				break;
			}
			stepForward();

			await setComponentFile({
				...instanceParams,
				file: newFile,
				project: newProject,
				payload: fileContents.message,
			});
			if (canceled) {
				break;
			}
			stepForward();

			await dropComponent({
				...instanceParams,
				file: oldFile,
				project: oldProject,
			});
			if (canceled) {
				break;
			}
			stepForward();
		}

		if (currentStep >= totalSteps) {
			toast.success(`Renamed ${pluralize(actualChanges.length, 'File', 'Files')}`, {
				id: toastConfig.id,
				description: 'All done!',
				duration: 3000,
				action: {
					label: 'OK!',
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
					label: 'Gotcha',
					onClick: () => {
						// >_<
					},
				},
			});
		}

		reloadRootEntries();

		setSelectedItems(selectedItems => {
			const updatedSelectedItems = selectedItems.slice();
			for (const change of actualChanges) {
				const existingIndex = selectedItems.indexOf(change.from);
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
	}, [instanceParams, reloadRootEntries, setFocusedItem, setSelectedItems]);
}
