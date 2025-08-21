import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface DeleteComponentFileRequest extends InstanceClientConfig {
	project: string;
	file: string | undefined;
}

async function onDeleteComponentFolderFile({ file, project, instanceClient }: DeleteComponentFileRequest) {
	const { data } = await instanceClient.post('/', {
		operation: 'drop_component',
		file: file || undefined,
		project,
		replicated: true,
	});
	return data;
}

export function useDeleteComponentFolderFile() {
	return useMutation({
		mutationFn: onDeleteComponentFolderFile,
	});
}
