import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

type DeleteComponentFileRequest = {
	file: string | undefined;
	project: string;
};

const onDeleteComponentFolderFile = async (componentFileData: DeleteComponentFileRequest) => {
	const { file, project } = componentFileData;
	const { data } = await instanceClient.post('/', {
		operation: 'drop_component',
		file: file || undefined,
		project,
		replicated: true,
	});
	return data;
};

const useDeleteComponentFolderFile = () => {
	return useMutation({
		mutationFn: (componentFileData: DeleteComponentFileRequest) => onDeleteComponentFolderFile(componentFileData),
	});
};

export { useDeleteComponentFolderFile };
export type { DeleteComponentFileRequest };
