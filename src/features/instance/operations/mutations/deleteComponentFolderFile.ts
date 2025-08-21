import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface DeleteComponentFileRequest extends InstanceClientConfig {
	project: string;
	file: string | undefined;
	replicated: boolean;
}

async function onDeleteComponentFolderFile({ file, project, replicated, instanceClient }: DeleteComponentFileRequest) {
	const { data } = await instanceClient.post('/', {
		operation: 'drop_component',
		file: file || undefined,
		project,
		replicated,
	});
	return data;
}

export function useDeleteComponentFolderFile() {
	return useMutation({
		mutationFn: onDeleteComponentFolderFile,
	});
}
