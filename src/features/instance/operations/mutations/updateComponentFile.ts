import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

type SetComponentFileRequest = {
	file: string;
	payload?: string;
	project: string;
};

const onUpdateComponentFile = async (componentFileData: SetComponentFileRequest) => {
	const { file, payload, project } = componentFileData;
	const { data } = await instanceClient.post('/', {
		operation: 'set_component_file',
		file,
		payload,
		project,
	});
	return data;
};

const useUpdateComponentFile = () => {
	return useMutation({
		mutationFn: (componentFileData: SetComponentFileRequest) => onUpdateComponentFile(componentFileData),
	});
};

export { useUpdateComponentFile };
export type { SetComponentFileRequest };
