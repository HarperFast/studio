import { InstanceClientConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

export interface SetComponentFileRequest extends InstanceClientConfig, InstanceTypeConfig {
	file: string;
	payload?: string;
	project: string;
}

export async function setComponentFile({ file, payload, project, entityType, instanceClient }: SetComponentFileRequest) {
	const { data } = await instanceClient.post('/', {
		operation: 'set_component_file',
		file,
		payload,
		project,
		replicated: entityType === 'cluster',
	});
	return data;
}

export function useSetComponentFile() {
	return useMutation({
		mutationFn: setComponentFile,
	});
}
