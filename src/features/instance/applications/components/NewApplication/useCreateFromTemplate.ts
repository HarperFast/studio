import { useInstanceClientParams } from '@/config/useInstanceClient';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useAddComponentMutation } from '@/features/instance/operations/mutations/addComponent';
import { findBy } from '@/lib/arrays/findBy';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { TemplateSchema } from './schema';
import { templates } from './templates';

export function useCreateFromTemplate(
	setIsReloading: (isReloading: boolean) => void,
) {
	const { mutate, isPending: isCreatingFromTemplate } = useAddComponentMutation();
	const instanceParams = useInstanceClientParams();
	const { reloadRootEntries, setFocusedItem, setExpandedItems, setSelectedItems } = useEditorView();
	const callback = useCallback(({
		contents,
		project,
	}: {
		contents: z.infer<typeof TemplateSchema>
		project: string,
	}) => {
		const toastId = toast.loading(`Creating from template...`, {
			description: 'This may take a bit.',
			duration: 300_000,
		});
		const template = findBy(templates, 'id', contents.id);
		if (!template) {
			return toast.error('Template Not Found', {
				description: 'Please select a template',
				duration: 10_000,
				id: toastId,
			});
		}
		mutate({
			project,
			template: template.githubUrl,
			...instanceParams,
		}, {
			onSuccess: () => {
				toast.success(`Created successfully!`, {
					description: `${project} will be available once you restart your ${instanceParams.entityType}!`,
					id: toastId,
					duration: 5_000,
				});
				setIsReloading(true);
				void reloadRootEntries();
				setFocusedItem(project);
				setSelectedItems([project]);
				setExpandedItems([project]);
			},
		});
	}, [mutate, instanceParams, setIsReloading, reloadRootEntries, setFocusedItem, setExpandedItems, setSelectedItems]);

	return useMemo(() => ({
		isCreatingFromTemplate,
		createFromTemplate: callback,
	}), [isCreatingFromTemplate, callback]);
}
